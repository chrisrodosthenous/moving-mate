const path = require('path');
const fs = require('fs');
const multer = require('multer');

const DOCS_DIR = path.join(__dirname, '..', 'uploads', 'driver-documents');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOCS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
    const base = path.basename(file.originalname, path.extname(file.originalname)).replace(/\s+/g, '-') || 'doc';
    cb(null, `${Date.now()}-${file.fieldname}-${base}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Invalid file type. Only PDF, JPG and PNG are allowed.'));
};

const uploadDriverDocs = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter,
});

module.exports = { uploadDriverDocs };

