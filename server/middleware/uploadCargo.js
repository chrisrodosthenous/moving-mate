const path = require('path');
const fs = require('fs');
const multer = require('multer');

const CARGO_DIR = path.join(__dirname, '..', 'uploads', 'cargo');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/jpg', 'image/png'];

if (!fs.existsSync(CARGO_DIR)) {
  fs.mkdirSync(CARGO_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CARGO_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, path.extname(file.originalname)).replace(/\s+/g, '-') || 'cargo';
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Invalid file type. Only JPG and PNG are allowed for cargo photo.'));
};

const uploadCargo = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter,
});

module.exports = { uploadCargo };
