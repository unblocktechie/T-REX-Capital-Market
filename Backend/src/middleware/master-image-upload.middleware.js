const multer = require('multer');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');
const { allowedTokenImageMimeTypes } = require('./token-image-upload.middleware');

const masterImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: env.tokenImages.maxFileSizeBytes },
  fileFilter: (req, file, callback) => {
    if (!allowedTokenImageMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(
        422,
        'Image must be PNG, JPEG, WebP, or SVG.',
        undefined,
        'INVALID_MASTER_IMAGE_TYPE',
      ));
    }
    return callback(null, true);
  },
}).single('image');

const parseMasterMultipartFields = (req, res, next) => {
  for (const field of ['fallbackRpcUrls', 'delegationManagerAddresses', 'paymentTokenAddresses']) {
    if (typeof req.body?.[field] !== 'string') continue;
    try {
      req.body[field] = JSON.parse(req.body[field]);
    } catch {
      return next(new ApiError(422, `${field} must be a valid JSON array.`, [{ field, message: 'Invalid JSON array.' }], 'INVALID_MULTIPART_JSON'));
    }
  }
  return next();
};

module.exports = { masterImageUpload, parseMasterMultipartFields };
