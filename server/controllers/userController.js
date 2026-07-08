/** User profile controller: update profile, get driver average rating. */
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const User = require('../models/User');
const TransportOrder = require('../models/TransportOrder');
const mongoose = require('mongoose');
const {
  normalizeDistrictsInput,
  validateDriverDistrictsForProfile,
  validateDriverDistrictsRequired,
  normalizedDriverDistricts,
} = require('../constants/cyprusDistricts');
const { validatePassword } = require('../utils/passwordValidation');
const { emitToAdmins } = require('../services/realtimeService');
const { sendVerificationRequestToAdminsPush } = require('../services/pushNotificationService');
const { sanitizeFcmTokens } = require('../utils/fcmTokens');
const { strictMongoObjectIdString } = require('../utils/objectId');

const PHONE_DIGITS_REGEX = /^\d{8}$/;
const PHONE_PREFIX = '+357';

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id;
}

function normalizePhoneNumber(input) {
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 8) return PHONE_PREFIX + digits;
  if (digits.length === 11 && digits.startsWith('357')) return '+' + digits;
  return null;
}

/**
 * PUT/PATCH /api/users/profile - Update current user's profile (+ optional password change).
 * Body: {
 *   firstName?, lastName?, phoneNumber?, district?, homeAddress?, districts?,
 *   carModel?, plateNumber? (drivers only),
 *   currentPassword?, newPassword?
 * }.
 * districts: driver only; array of Nicosia, Limassol, Larnaca, Paphos, Famagusta; [] = see all provinces.
 * For drivers, prefer `districts`; legacy `district` alone maps to driver scope when `districts` is omitted.
 */
async function updateProfile(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const {
      firstName,
      lastName,
      phoneNumber,
      homeAddress,
      district,
      districts,
      carModel,
      plateNumber,
      currentPassword,
      newPassword,
    } = req.body;
    const updates = {};
    const wantsPasswordChange = String(newPassword || '').trim().length > 0;

    if (districts !== undefined) {
      const actor = await User.findById(userId).select('role').lean();
      if (actor?.role !== 'driver') {
        return res.status(400).json({ message: 'districts can only be updated for driver accounts' });
      }
      if (!Array.isArray(districts)) {
        return res.status(400).json({ message: 'districts must be an array of district names' });
      }
      const normalized = normalizeDistrictsInput(districts);
      const profErr = validateDriverDistrictsForProfile(normalized);
      if (profErr) {
        return res.status(400).json({ message: profErr });
      }
      updates.districts = normalized;
    }

    if (firstName != null) {
      const trimmed = typeof firstName === 'string' ? firstName.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ message: 'First name cannot be empty' });
      }
      updates.firstName = trimmed;
    }

    if (lastName != null) {
      const trimmed = typeof lastName === 'string' ? lastName.trim() : '';
      if (!trimmed) {
        return res.status(400).json({ message: 'Last name cannot be empty' });
      }
      updates.lastName = trimmed;
    }

    if (phoneNumber != null) {
      const normalized = normalizePhoneNumber(phoneNumber);
      if (!normalized || !PHONE_DIGITS_REGEX.test(normalized.slice(4))) {
        return res.status(400).json({ message: 'Phone number must be exactly 8 digits after +357' });
      }
      const existing = await User.findOne({
        phoneNumber: normalized,
        _id: { $ne: toObjectId(userId) },
      });
      if (existing) {
        return res.status(409).json({ message: 'A user with this phone number already exists' });
      }
      updates.phoneNumber = normalized;
    }

    if (district !== undefined && districts === undefined) {
      const actor = await User.findById(userId).select('role').lean();
      const trimmed = typeof district === 'string' ? district.trim() : '';
      if (actor?.role === 'driver') {
        if (!trimmed) {
          updates.districts = [];
          updates.district = null;
        } else {
          const districtErr = validateDriverDistrictsForProfile([trimmed]);
          if (districtErr) {
            return res.status(400).json({ message: districtErr });
          }
          updates.districts = [trimmed];
          updates.district = null;
        }
      } else if (trimmed) {
        const districtErr = validateDriverDistrictsForProfile([trimmed]);
        if (districtErr) {
          return res.status(400).json({ message: districtErr });
        }
        updates.district = trimmed;
      } else {
        updates.district = null;
      }
    }

    if (homeAddress !== undefined) {
      updates.homeAddress = typeof homeAddress === 'string' ? homeAddress.trim() : '';
    }

    if (carModel !== undefined || plateNumber !== undefined) {
      const actor = await User.findById(userId).select('role').lean();
      if (!actor || actor.role !== 'driver') {
        return res.status(400).json({ message: 'Vehicle fields can only be updated for driver accounts' });
      }
      if (carModel !== undefined) {
        updates.carModel = typeof carModel === 'string' ? carModel.trim() : '';
      }
      if (plateNumber !== undefined) {
        updates.plateNumber = typeof plateNumber === 'string' ? plateNumber.trim() : '';
      }
    }

    if (Object.keys(updates).length === 0 && !wantsPasswordChange) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const user = await User.findById(userId).select(wantsPasswordChange ? '+password' : '-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (wantsPasswordChange) {
      const current = String(currentPassword || '');
      if (!current) {
        return res.status(400).json({ message: 'Current password is required to set a new password' });
      }
      const pwdPolicyErr = validatePassword(String(newPassword || ''));
      if (pwdPolicyErr) {
        return res.status(400).json({ message: pwdPolicyErr });
      }
      const ok = await bcrypt.compare(current, user.password);
      if (!ok) {
        return res.status(400).json({ message: 'Current password is incorrect' });
      }
    }

    if (Object.keys(updates).length > 0) {
      Object.assign(user, updates);
      if (Object.prototype.hasOwnProperty.call(updates, 'districts')) {
        user.district = null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, 'homeAddress')) {
        user.markModified('homeAddress');
      }
    }

    if (wantsPasswordChange) {
      user.password = await bcrypt.hash(String(newPassword), 10);
    }

    await user.save({ runValidators: true });

    const saved = await User.findById(userId).select('-password').lean();
    const profileFieldsUpdated = Object.keys(updates).length > 0;
    const message =
      wantsPasswordChange && !profileFieldsUpdated
        ? 'Password updated successfully'
        : 'Profile updated successfully';
    res.json({
      success: true,
      message,
      user: toAuthUser(saved),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/profile/districts — driver working districts (array); at least one required.
 * Body: { districts: string[] }
 */
async function updateProfileDistricts(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const actor = await User.findById(userId).select('role').lean();
    if (!actor || actor.role !== 'driver') {
      return res.status(403).json({ message: 'Only drivers can update working districts' });
    }

    const raw = req.body?.districts;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ message: 'districts must be an array of district names' });
    }
    const normalized = normalizeDistrictsInput(raw);
    const districtErr = validateDriverDistrictsRequired(normalized);
    if (districtErr) {
      return res.status(400).json({ message: districtErr });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.districts = normalized;
    user.district = null;
    await user.save({ runValidators: true });

    const saved = await User.findById(userId).select('-password').lean();
    res.json({
      success: true,
      message: 'Working districts updated successfully',
      user: toAuthUser(saved),
    });
  } catch (err) {
    next(err);
  }
}

function formatDob(d) {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Build auth/user response shape (profile + driver extras). */
function toAuthUser(user) {
  const base = {
    id: user._id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phoneNumber,
    email: user.email,
    district: user.district || '',
    homeAddress: user.homeAddress || '',
    dateOfBirth: formatDob(user.dateOfBirth),
    role: user.role,
    isVerified: user.isVerified === true,
    licenseUrl: user.licenseUrl || '',
    verificationStatus: user.verificationStatus || 'none',
    /** Same as verificationStatus — license review state for the driver profile UI. */
    licenseStatus: user.verificationStatus || 'none',
    districts: normalizedDriverDistricts(user),
    fcmTokens: sanitizeFcmTokens(Array.isArray(user.fcmTokens) ? user.fcmTokens : []),
  };
  if (user.role === 'driver') {
    base.averageRating = user.averageRating != null ? user.averageRating : null;
    const rc = typeof user.reviewCount === 'number' ? user.reviewCount : typeof user.totalReviews === 'number' ? user.totalReviews : 0;
    base.reviewCount = rc;
    base.totalReviews = rc;
    base.carModel = user.carModel || '';
    base.plateNumber = user.plateNumber || '';
    base.licenseNumber = user.licenseNumber || '';
    base.rejectionReason = user.rejectionReason || '';
    base.vehicleType = user.vehicleType || undefined;
    base.vehiclePhotoUrl = user.vehiclePhotoUrl || '';
  }
  return base;
}

/**
 * POST /api/users/profile/submit-verification — legacy route; verification is file-only (POST /api/users/upload-license).
 */
async function submitLicenseVerification(req, res) {
  return res.status(400).json({
    message:
      'License verification is done by uploading your license file on the driver profile. License number submission is no longer used.',
  });
}

/**
 * POST /api/users/change-password
 * Body: { currentPassword, newPassword }
 */
async function changePassword(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'User not authenticated' });

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    const pwdPolicyErr = validatePassword(newPassword);
    if (pwdPolicyErr) {
      return res.status(400).json({ message: pwdPolicyErr });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save({ runValidators: true });
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/users/profile - Return the logged-in user's data (for driver check verification status).
 * Expects authMiddleware to have set req.user (JWT payload with userId or _id).
 */
async function getProfile(req, res) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    const user = await User.findById(userId).select('-password').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ success: true, user: toAuthUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error' });
  }
}

/**
 * POST /api/users/upload-license - Upload license file for the logged-in user.
 * If the user already had a licenseUrl (e.g. after rejection), the old file is deleted from disk.
 */
async function uploadLicense(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const actor = await User.findById(userId).select('role').lean();
    if (!actor || actor.role !== 'driver') {
      return res.status(403).json({ message: 'Only drivers can upload a license file.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded. Please select a PDF, JPG or PNG file.' });
    }

    const current = await User.findById(userId).select('licenseUrl').lean();
    if (current?.licenseUrl) {
      const oldPath = path.join(__dirname, '..', current.licenseUrl.replace(/^\//, ''));
      try {
        await fs.unlink(oldPath);
      } catch (e) {
        if (e.code !== 'ENOENT') {
          // Log but don't fail the upload if file was already missing
          console.error('Could not delete old license file:', oldPath, e.message);
        }
      }
    }

    const filePath = `/uploads/licenses/${req.file.filename}`;
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        licenseUrl: filePath,
        verificationStatus: 'pending',
        isVerified: false,
        rejectionReason: '',
      },
      { returnDocument: 'after', runValidators: false }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const io = req.app.get('io');
    if (io) {
      emitToAdmins(io, 'new_verification_request', {
        userId: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        phoneNumber: updatedUser.phoneNumber,
        licenseUrl: updatedUser.licenseUrl || '',
        verificationStatus: updatedUser.verificationStatus,
        createdAt: updatedUser.createdAt,
      });
    }

    // Push all admin users so they can review immediately (fire-and-forget).
    const driverName = `${updatedUser.firstName || ''} ${updatedUser.lastName || ''}`.trim();
    sendVerificationRequestToAdminsPush({ driverName, driverId: updatedUser._id }).catch((err) =>
      console.warn('[Push] sendVerificationRequestToAdminsPush failed:', err.message)
    );

    res.json({
      success: true,
      message: 'License uploaded successfully',
      user: toAuthUser(updatedUser),
    });
  } catch (err) {
    next(err);
  }
}

const COMPLETED_TRIP_STATUSES = ['delivered', 'completed'];
const CANCELLED_TRIP_STATUSES = ['cancelled', 'canceled'];
const CHART_TREND_DAYS = 30;

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function lastNDayBuckets(days) {
  const buckets = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const span = Math.max(1, Math.floor(days));
  for (let offset = span - 1; offset >= 0; offset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    buckets.push({
      key: localDateKey(d),
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    });
  }
  return buckets;
}

/**
 * GET /api/users/driver-analytics — weekly earnings, trip stats, rating (driver dashboard charts).
 */
async function getDriverAnalytics(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    const driverObjectId = toObjectId(userId);
    if (!driverObjectId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findById(driverObjectId).select('role averageRating reviewCount totalReviews').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'driver') {
      return res.status(403).json({ message: 'Only drivers can access analytics' });
    }

    const dayBuckets = lastNDayBuckets(CHART_TREND_DAYS);
    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeStart.setDate(rangeStart.getDate() - (CHART_TREND_DAYS - 1));

    const earnedOrders = await TransportOrder.find({
      driverId: driverObjectId,
      status: { $in: COMPLETED_TRIP_STATUSES },
      createdAt: { $gte: rangeStart },
    })
      .select('price createdAt')
      .lean();

    const earningsByDay = Object.fromEntries(dayBuckets.map((b) => [b.key, 0]));
    for (const o of earnedOrders) {
      const created = new Date(o.createdAt);
      if (Number.isNaN(created.getTime())) continue;
      const key = localDateKey(created);
      if (!(key in earningsByDay)) continue;
      earningsByDay[key] += Number(o.price) || 0;
    }

    const [completed, cancelled] = await Promise.all([
      TransportOrder.countDocuments({
        driverId: driverObjectId,
        status: { $in: COMPLETED_TRIP_STATUSES },
      }),
      TransportOrder.countDocuments({
        driverId: driverObjectId,
        status: { $in: CANCELLED_TRIP_STATUSES },
      }),
    ]);

    /** No persisted “driver declined offer” events yet — reserved for future tracking. */
    const declined = 0;

    const averageRating = user.averageRating != null ? Number(user.averageRating) : null;

    res.json({
      weeklyEarnings: {
        labels: dayBuckets.map((b) => b.label),
        euros: dayBuckets.map((b) => Math.round((earningsByDay[b.key] ?? 0) * 100) / 100),
      },
      tripStats: {
        completed,
        cancelled,
        declined,
      },
      rating: {
        average: averageRating,
        max: 5,
        priorityThreshold: 4.5,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/driver-rating - Driver's average rating and review count (from User, maintained by Review submissions).
 */
async function getDriverRating(req, res, next) {
  try {
    const userId = req.user?.userId ?? req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    const user = await User.findById(userId).select('role averageRating totalReviews reviewCount').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'driver' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only drivers have a service rating' });
    }
    if (user.role === 'admin') {
      return res.json({ averageRating: null, reviewCount: 0, totalReviews: 0, totalRatings: 0 });
    }
    const averageRating = user.averageRating != null ? user.averageRating : null;
    const totalReviews =
      typeof user.reviewCount === 'number'
        ? user.reviewCount
        : typeof user.totalReviews === 'number'
          ? user.totalReviews
          : 0;
    res.json({
      averageRating,
      reviewCount: totalReviews,
      totalReviews,
      totalRatings: totalReviews,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/users/update-fcm-token - Register a device token for the logged-in user.
 * Uses $addToSet so multiple devices (phone + PC) can receive pushes simultaneously.
 * Body: { fcmToken: string }
 */
async function updateFcmToken(req, res, next) {
  try {
    const rawId = req.user?.userId ?? req.user?._id;
    const userIdStr = strictMongoObjectIdString(rawId);
    if (!userIdStr) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const rawToken = req.body?.fcmToken;
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!token) {
      return res.status(400).json({ message: 'fcmToken is required' });
    }
    if (token.length <= 10) {
      return res.status(400).json({ message: 'fcmToken is not a valid FCM registration token' });
    }

    // Strip empty / null entries from MongoDB before merging (bad index 0, legacy data, etc.).
    await User.updateOne({ _id: userIdStr }, { $pull: { fcmTokens: '' } });
    await User.updateOne({ _id: userIdStr }, { $pull: { fcmTokens: null } });

    // Add token with $addToSet (no duplicate string for this user). Do NOT $pull this token from
    // other users — the same browser FCM string must stay on every account that registered it so
    // push still works after logout (otherwise logging in as another role on the same device wiped
    // the previous user's fcmTokens).
    await User.updateOne(
      { _id: userIdStr },
      { $addToSet: { fcmTokens: token }, $unset: { fcmToken: '' } }
    );

    const existing = await User.findById(userIdStr).select('fcmTokens').lean();
    if (!existing) {
      return res.status(404).json({ message: 'User not found' });
    }

    const merged = sanitizeFcmTokens(Array.isArray(existing.fcmTokens) ? existing.fcmTokens : []);
    if (!merged.length) {
      console.error('[FCM] Refusing update-fcm-token: would leave empty fcmTokens');
      return res.status(500).json({ message: 'Could not persist FCM token' });
    }

    const user = await User.findByIdAndUpdate(
      userIdStr,
      { $set: { fcmTokens: merged } },
      { returnDocument: 'after', runValidators: false, strict: false }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`[FCM] Token registered for user ${userIdStr} | devices=${user.fcmTokens.length} | token=…${token.slice(-10)}`);

    res.json({
      success: true,
      message: 'FCM token registered successfully',
      user: toAuthUser(user),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/fcm-token
 * Intentionally does NOT remove tokens from MongoDB. Tokens must persist through logout so
 * customers and drivers receive push notifications while offline. Clients may still call this
 * after logout for backward compatibility; the server keeps all stored registration strings.
 * Body: { fcmToken: string } (validated but not used to mutate DB)
 */
async function removeFcmToken(req, res, next) {
  try {
    const rawId = req.user?.userId ?? req.user?._id;
    const userId = strictMongoObjectIdString(rawId);
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const rawToken = req.body?.fcmToken;
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!token) {
      return res.status(400).json({ message: 'fcmToken is required' });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[FCM] DELETE /fcm-token acknowledged — no DB change (token retention) | user=${userId} | …${token.slice(-10)}`
      );
    }

    res.json({
      success: true,
      message:
        'FCM registration tokens are retained on the server for offline push notifications.',
    });
  } catch (err) {
    next(err);
  }
}

exports.updateProfile = updateProfile;
exports.updateProfileDistricts = updateProfileDistricts;
exports.getDriverAnalytics = getDriverAnalytics;
exports.getDriverRating = getDriverRating;
exports.getProfile = getProfile;
exports.submitLicenseVerification = submitLicenseVerification;
exports.uploadLicense = uploadLicense;
exports.updateFcmToken = updateFcmToken;
exports.removeFcmToken = removeFcmToken;
exports.changePassword = changePassword;
