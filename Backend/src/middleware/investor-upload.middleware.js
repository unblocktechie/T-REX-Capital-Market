const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');

fs.mkdirSync(env.investorUploads.directory, { recursive: true });

const allowedMimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const allowedExtensions = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, env.investorUploads.directory),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${allowedExtensions.has(extension) ? extension : ''}`);
  },
});

const investorUpload = multer({
  storage,
  limits: { fileSize: env.investorUploads.maxFileSizeBytes, files: env.investorUploads.maxFiles },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
      return callback(new ApiError(422, 'Only PDF, PNG, JPG, and JPEG documents are allowed.', undefined, 'INVALID_FILE_TYPE'));
    }
    return callback(null, true);
  },
}).array('documents', env.investorUploads.maxFiles);

module.exports = { investorUpload, allowedMimeTypes, allowedExtensions };
