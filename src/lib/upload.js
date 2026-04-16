const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const safe = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${safe}${ext}`);
  }
});

const ALLOWED = new Set(['.pdf', '.doc', '.docx', '.rtf', '.txt', '.odt']);

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.has(ext)) return cb(null, true);
    cb(new Error('Only PDF, DOC, DOCX, RTF, TXT, or ODT files are allowed.'));
  }
});

module.exports = { upload, UPLOAD_DIR };
