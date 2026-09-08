const multer = require('multer');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');

const allowedTokenImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

const tokenImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: env.tokenImages.maxFileSizeBytes,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedTokenImageMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(
        422,
        'Token image must be PNG, JPEG, WebP, or SVG.',
        undefined,
        'INVALID_TOKEN_IMAGE_TYPE',
      ));
    }
    return callback(null, true);
  },
}).single('tokenImage');

module.exports = { tokenImageUpload, allowedTokenImageMimeTypes };
