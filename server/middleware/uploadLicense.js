const path = require('path');
const fs = require('fs');
const multer = require('multer');

const LICENSES_DIR = path.join(__dirname, '..', 'uploads', 'licenses');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

// Ensure uploads/licenses exists
if (!fs.existsSync(LICENSES_DIR)) {
  fs.mkdirSync(LICENSES_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LICENSES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
    const base = path.basename(file.originalname, path.extname(file.originalname)).replace(/\s+/g, '-') || 'license';
    const unique = `${Date.now()}-${base}${ext}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIMES.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only PDF, JPG and PNG are allowed.'));
  }
  const name = String(file.originalname || '');
  if (name && /\.[^.]+$/.test(name) && !/\.(jpe?g|png|pdf)$/i.test(name)) {
    return cb(new Error('Invalid file type. Only PDF, JPG and PNG are allowed.'));
  }
  cb(null, true);
};

const uploadLicense = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter,
});

module.exports = { uploadLicense };
