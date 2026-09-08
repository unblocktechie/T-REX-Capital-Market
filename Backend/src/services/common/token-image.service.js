const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const sharp = require('sharp');
const { env } = require('../../core/config/env');
const { ApiError } = require('../../core/errors/api-error');

const execFileAsync = promisify(execFile);
const formatMimeTypes = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
});

class TokenImageService {
  constructor(config = env.tokenImages) {
    this.config = config;
    fs.mkdirSync(this.config.directory, { recursive: true });
  }

  async scanForViruses(buffer) {
    if (!this.config.virusScannerPath) return 'notConfigured';

    const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'trex-token-scan-'));
    const tempFile = path.join(tempDirectory, 'token-image-upload');
    try {
      await fs.promises.writeFile(tempFile, buffer, { flag: 'wx' });
      try {
        await execFileAsync(
          this.config.virusScannerPath,
          ['--no-summary', tempFile],
          { timeout: this.config.virusScanTimeoutMs, windowsHide: true },
        );
        return 'clean';
      } catch (error) {
        if (error.code === 1 || /\bFOUND\b/i.test(`${error.stdout || ''} ${error.stderr || ''}`)) {
          throw new ApiError(422, 'Token image failed the malware scan.', undefined, 'TOKEN_IMAGE_MALWARE_DETECTED');
        }
        throw new ApiError(503, 'Token image malware scanner is unavailable.', undefined, 'TOKEN_IMAGE_SCANNER_UNAVAILABLE');
      }
    } finally {
      await fs.promises.rm(tempDirectory, { recursive: true, force: true });
    }
  }

  validateSvg(buffer) {
    const source = buffer.toString('utf8').toLowerCase();
    if (
      !source.includes('<svg')
      || /<!doctype|<!entity|<script|onload\s*=|onerror\s*=|(?:href|src)\s*=\s*["'](?:https?:|file:)/i.test(source)
    ) {
      throw new ApiError(422, 'SVG token image contains unsafe or invalid content.', undefined, 'INVALID_TOKEN_IMAGE');
    }
  }

  async process(file) {
    if (!file?.buffer?.length) {
      throw new ApiError(422, 'A token image is required.', undefined, 'TOKEN_IMAGE_REQUIRED');
    }

    const virusScanStatus = await this.scanForViruses(file.buffer);
    let metadata;
    try {
      metadata = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: this.config.maxDimension * this.config.maxDimension,
      }).metadata();
    } catch {
      throw new ApiError(422, 'Token image is corrupted or has an invalid file signature.', undefined, 'INVALID_TOKEN_IMAGE');
    }

    const actualMimeType = formatMimeTypes[metadata.format];
    if (!actualMimeType || actualMimeType !== file.mimetype) {
      throw new ApiError(
        422,
        'Token image MIME type does not match its decoded file format.',
        undefined,
        'TOKEN_IMAGE_SIGNATURE_MISMATCH',
      );
    }
    if (metadata.format === 'svg') this.validateSvg(file.buffer);

    const { width, height } = metadata;
    if (!width || !height) {
      throw new ApiError(422, 'Token image dimensions could not be determined.', undefined, 'INVALID_TOKEN_IMAGE_DIMENSIONS');
    }
    if (width < this.config.minDimension || height < this.config.minDimension) {
      throw new ApiError(
        422,
        `Token image dimensions must be at least ${this.config.minDimension}x${this.config.minDimension}.`,
        undefined,
        'TOKEN_IMAGE_TOO_SMALL',
      );
    }
    if (width > this.config.maxDimension || height > this.config.maxDimension) {
      throw new ApiError(
        422,
        `Token image dimensions cannot exceed ${this.config.maxDimension}x${this.config.maxDimension}.`,
        undefined,
        'TOKEN_IMAGE_TOO_LARGE',
      );
    }

    let optimizedBuffer;
    try {
      optimizedBuffer = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: this.config.maxDimension * this.config.maxDimension,
      })
        .rotate()
        .resize({
          width: this.config.optimizedMaxDimension,
          height: this.config.optimizedMaxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 85, effort: 4 })
        .toBuffer();
    } catch {
      throw new ApiError(422, 'Token image could not be optimized.', undefined, 'TOKEN_IMAGE_OPTIMIZATION_FAILED');
    }
    if (optimizedBuffer.length > this.config.maxFileSizeBytes) {
      throw new ApiError(422, 'Optimized token image exceeds the 2 MB limit.', undefined, 'TOKEN_IMAGE_TOO_LARGE');
    }

    const optimizedMetadata = await sharp(optimizedBuffer).metadata();
    const storageKey = `${crypto.randomUUID()}.webp`;
    const filePath = path.resolve(this.config.directory, storageKey);
    await fs.promises.writeFile(filePath, optimizedBuffer, { flag: 'wx' });

    return {
      fields: {
        imageOriginalFileName: path.basename(file.originalname),
        imageStorageKey: storageKey,
        imageMimeType: 'image/webp',
        imageFileSize: optimizedBuffer.length,
        imageWidth: optimizedMetadata.width,
        imageHeight: optimizedMetadata.height,
        imageChecksumSha256: crypto.createHash('sha256').update(optimizedBuffer).digest('hex'),
        imageVirusScanStatus: virusScanStatus,
      },
      filePath,
    };
  }

  resolve(storageKey) {
    const directory = path.resolve(this.config.directory);
    const filePath = path.resolve(directory, storageKey || '');
    if (!storageKey || !filePath.startsWith(`${directory}${path.sep}`)) {
      throw ApiError.notFound('Token image was not found.');
    }
    return filePath;
  }

  async remove(storageKey) {
    if (!storageKey) return;
    const filePath = this.resolve(storageKey);
    await fs.promises.unlink(filePath).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

module.exports = { TokenImageService, formatMimeTypes };
