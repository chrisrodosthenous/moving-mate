/** Auth controller: register (create user + JWT) and login (phone/password -> JWT). */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');
const {
  normalizeDistrictsInput,
  validateDriverDistrictsForRegister,
  normalizedDriverDistricts,
} = require('../constants/cyprusDistricts');
const {
  isDriverAgeEligible,
} = require('../utils/driverAge');
const { validatePassword } = require('../utils/passwordValidation');
const { emitToAdmins } = require('../services/realtimeService');
const { sendVerificationRequestToAdminsPush } = require('../services/pushNotificationService');
const { sendPasswordResetEmail, clientBaseUrl } = require('../services/notificationService');

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

const DRIVER_VEHICLE_TYPES = new Set(['pickup', 'minivan', 'van', 'truck']);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_REGEX = /^\d{8}$/;
const PHONE_PREFIX = '+357';

function parseDistrictsInputMaybe(districtsRaw) {
  if (Array.isArray(districtsRaw)) return districtsRaw;
  if (typeof districtsRaw !== 'string') return districtsRaw;
  const s = districtsRaw.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }
}

function parseDateOfBirthInput(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
  const m = s.match(isoDate);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return d;
}

function normalizePhoneNumber(input) {
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 8) return PHONE_PREFIX + digits;
  if (digits.length === 11 && digits.startsWith('357')) return '+' + digits;
  return null;
}

/** Builds the public user object returned in both login and register responses. */
function buildUserOut(user) {
  const out = {
    id: user._id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phoneNumber,
    email: user.email,
    role: user.role,
    isVerified: user.isVerified === true,
    licenseUrl: user.licenseUrl || '',
    verificationStatus: user.verificationStatus || 'none',
    licenseStatus: user.verificationStatus || 'none',
    districts: normalizedDriverDistricts(user),
  };
  if (user.role === 'driver') {
    out.carModel = user.carModel || '';
    out.plateNumber = user.plateNumber || '';
    out.licenseNumber = user.licenseNumber || '';
    out.rejectionReason = user.rejectionReason || '';
    out.vehicleType = user.vehicleType || undefined;
    out.vehiclePhotoUrl = user.vehiclePhotoUrl || '';
    out.averageRating = user.averageRating != null ? user.averageRating : null;
    const rc =
      typeof user.reviewCount === 'number'
        ? user.reviewCount
        : typeof user.totalReviews === 'number'
          ? user.totalReviews
          : 0;
    out.reviewCount = rc;
    out.totalReviews = rc;
  }
  return out;
}

/**
 * Register a new user.
 * Body: { firstName, lastName, email, password, phoneNumber, dateOfBirth, role, districts? }
 * districts (string[]) required when role is "driver"; at least one Cyprus district.
 */
async function register(req, res, next) {
  try {
    const { firstName, lastName, email, password, phoneNumber, dateOfBirth, role } = req.body;
    const districtsInput = parseDistrictsInputMaybe(req.body?.districts);

    const missing = [];
    if (!firstName?.trim()) missing.push('firstName');
    if (!lastName?.trim()) missing.push('lastName');
    if (!email?.trim()) missing.push('email');
    if (!password) missing.push('password');
    if (!phoneNumber) missing.push('phoneNumber');
    if (!dateOfBirth) missing.push('dateOfBirth');
    if (!role) missing.push('role');
    if (missing.length > 0) {
      return res.status(400).json({
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone || !PHONE_DIGITS_REGEX.test(normalizedPhone.slice(4))) {
      return res.status(400).json({ message: 'Phone number must be exactly 8 digits after +357' });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }
    if (!['customer', 'driver'].includes(role)) {
      return res.status(400).json({ message: 'Role must be "customer" or "driver"' });
    }

    const districtsNormalized = normalizeDistrictsInput(districtsInput);
    const dob = parseDateOfBirthInput(dateOfBirth);
    if (!dob) {
      return res.status(400).json({ message: 'Invalid date of birth' });
    }
    if (!isDriverAgeEligible(dob)) {
      return res.status(400).json({
        message: 'Registration failed: User must be between 18 and 65 years old.',
      });
    }

    if (role === 'driver') {
      const regErr = validateDriverDistrictsForRegister(districtsNormalized);
      if (regErr) {
        return res.status(400).json({ message: regErr });
      }
      const vt = req.body?.vehicleType != null ? String(req.body.vehicleType).trim() : '';
      if (!vt || !DRIVER_VEHICLE_TYPES.has(vt)) {
        return res.status(400).json({
          message: 'vehicleType must be pickup, minivan, van, or truck',
        });
      }
      const vehiclePhotoFile = req.files?.vehiclePhoto?.[0];
      if (!vehiclePhotoFile) {
        return res.status(400).json({ message: 'vehiclePhoto is required for driver registration' });
      }
    }

    const existing = await User.findOne({
      $or: [{ email: email.trim().toLowerCase() }, { phoneNumber: normalizedPhone }],
    });
    if (existing) {
      return res.status(400).json({ message: 'Email or Phone number already registered' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const userFields = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        phoneNumber: normalizedPhone,
        role,
        dateOfBirth: dob,
      };
      if (role === 'driver') {
        const idCardFile = req.files?.idCard?.[0];
        const licenseFile = req.files?.drivingLicense?.[0];
        const vehiclePhotoFile = req.files?.vehiclePhoto?.[0];
        userFields.districts = districtsNormalized;
        userFields.idCardPath = idCardFile ? `/uploads/driver-documents/${idCardFile.filename}` : '';
        userFields.licensePath = licenseFile ? `/uploads/driver-documents/${licenseFile.filename}` : '';
        userFields.licenseUrl = userFields.licensePath;
        userFields.vehicleType = String(req.body.vehicleType).trim();
        userFields.vehiclePhotoUrl = vehiclePhotoFile
          ? `/uploads/driver-documents/${vehiclePhotoFile.filename}`
          : '';
        if (vehiclePhotoFile) {
          userFields.verificationStatus = 'pending';
          userFields.isVerified = false;
        }
        if (req.body?.carModel != null) {
          userFields.carModel = String(req.body.carModel).trim();
        }
        if (req.body?.plateNumber != null) {
          userFields.plateNumber = String(req.body.plateNumber).trim();
        }
      }
      const user = new User(userFields);
      await user.save();

      const io = req.app.get('io');
      if (io && role === 'driver') {
        emitToAdmins(io, 'admin_new_registration', {
          userId: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          dateOfBirth: user.dateOfBirth,
          role: user.role,
          verificationStatus: user.verificationStatus || 'none',
          districts: normalizedDriverDistricts(user),
          idCardPath: user.idCardPath || '',
          licensePath: user.licensePath || '',
          vehicleType: user.vehicleType || '',
          vehiclePhotoUrl: user.vehiclePhotoUrl || '',
        });
        if (user.verificationStatus === 'pending') {
          emitToAdmins(io, 'new_verification_request', {
            userId: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            licenseUrl: user.licenseUrl || '',
            vehicleType: user.vehicleType || '',
            vehiclePhotoUrl: user.vehiclePhotoUrl || '',
            verificationStatus: user.verificationStatus,
            createdAt: user.createdAt,
          });
          const driverName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
          sendVerificationRequestToAdminsPush({ driverName, driverId: user._id }).catch((err) =>
            console.warn('[Push] sendVerificationRequestToAdminsPush failed:', err.message),
          );
        }
      }

      const token = jwt.sign(
        { userId: user._id, phone: user.phoneNumber, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: buildUserOut(user),
      });
    } catch (createErr) {
      return res.status(400).json({ message: createErr.message });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Login with email OR phone and password.
 * Body: { emailOrPhone, password } — emailOrPhone can be email or phone (8 digits / +357...).
 */
async function login(req, res, next) {
  try {
    const { emailOrPhone, password } = req.body;
    if (!emailOrPhone || !password) {
      return res.status(400).json({ message: 'Email/phone and password are required' });
    }

    const input = String(emailOrPhone).trim();
    const isEmail = EMAIL_REGEX.test(input);
    const normalizedPhone = normalizePhoneNumber(input);

    let user;
    if (isEmail) {
      user = await User.findOne({ email: input.toLowerCase() }).select('+password');
    } else if (normalizedPhone) {
      user = await User.findOne({ phoneNumber: normalizedPhone }).select('+password');
    } else {
      return res.status(401).json({ message: 'Invalid email/phone or password' });
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid email/phone or password' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email/phone or password' });
    }

    const token = jwt.sign(
      { userId: user._id, phone: user.phoneNumber, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      message: 'Login successful',
      token,
      user: buildUserOut(user),
    });
  } catch (err) {
    next(err);
  }
}

/** Success body shown when a reset link has been emailed. */
const FORGOT_PASSWORD_SENT_MESSAGE =
  'A password reset link has been sent to your email.';

/**
 * POST /api/auth/forgot-password
 * Body: { email }. Issues a reset token for any registered account (any role).
 * Returns 404 if the email is not registered so the UI can show a clear message.
 */
async function forgotPassword(req, res, next) {
  try {
    const raw = req.body?.email;
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'This email is not registered.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const baseUrl = clientBaseUrl();
    const resetLink = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    try {
      await sendPasswordResetEmail({
        to: user.email,
        firstName: user.firstName,
        resetUrl: resetLink,
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('[PASSWORD RESET] Email queued for:', user.email);
        console.log('[PASSWORD RESET] Reset link:', resetLink);
      }
    } catch (mailErr) {
      console.error('[PASSWORD RESET] Email send failed:', mailErr.message);
      console.log('[PASSWORD RESET] Reset link (use manually):', resetLink);
      return res.status(502).json({
        message: 'We could not send the reset email right now. Please try again later.',
      });
    }

    return res.json({ message: FORGOT_PASSWORD_SENT_MESSAGE });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * Body: { token, newPassword }. Clears reset fields after success.
 */
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const tokenRaw = typeof token === 'string' ? token.trim() : '';
    if (!tokenRaw) {
      return res.status(400).json({ message: 'Reset token is required' });
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const tokenHash = crypto.createHash('sha256').update(tokenRaw, 'utf8').digest('hex');
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetTokenHash');

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired reset link. Please request a new password reset.',
      });
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    res.json({
      message: 'Password updated successfully. You can sign in with your new password.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, forgotPassword, resetPassword };
