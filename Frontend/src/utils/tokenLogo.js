export const TOKEN_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const TOKEN_LOGO_MIN_DIMENSION = 256;
export const TOKEN_LOGO_MAX_DIMENSION = 4096;

export const TOKEN_LOGO_ACCEPT =
  '.png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/jpg,image/svg+xml,image/webp';

const SUPPORTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
]);

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'svg', 'webp']);

const getExtension = (fileName = '') => fileName.split('.').pop()?.toLowerCase() || '';

export const isSupportedTokenLogoFile = (file) => {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (type && type !== 'application/octet-stream') {
    return SUPPORTED_MIME_TYPES.has(type);
  }
  return SUPPORTED_EXTENSIONS.has(getExtension(file.name));
};

export const isSquareTokenLogo = (logo) =>
  Boolean(logo?.width && logo?.height && logo.width === logo.height);

export const getTokenLogoValidationError = (logo) => {
  if (!logo?.dataUrl) return 'Please upload a token logo.';
  if (!SUPPORTED_MIME_TYPES.has(String(logo.type || '').toLowerCase())) {
    return 'Upload a PNG, JPG, JPEG, SVG, or WebP image.';
  }
  const size = Number(logo.size);
  const width = Number(logo.width);
  const height = Number(logo.height);
  if (!Number.isFinite(size) || size <= 0 || size > TOKEN_LOGO_MAX_BYTES) {
    return 'Maximum file size is 2 MB.';
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < TOKEN_LOGO_MIN_DIMENSION ||
    height < TOKEN_LOGO_MIN_DIMENSION
  ) {
    return 'Image should be at least 256×256.';
  }
  if (width > TOKEN_LOGO_MAX_DIMENSION || height > TOKEN_LOGO_MAX_DIMENSION) {
    return 'Image dimensions cannot exceed 4096×4096.';
  }
  return '';
};

const readAsDataUrl = (source) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The selected image could not be read.'));
    reader.readAsDataURL(source);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The selected image could not be opened.'));
    image.src = src;
  });

const normalizeMimeType = (file) => {
  const type = String(file.type || '').toLowerCase();
  if (type === 'image/jpg') return 'image/jpeg';
  if (SUPPORTED_MIME_TYPES.has(type)) return type;
  const extension = getExtension(file.name);
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'svg') return 'image/svg+xml';
  if (extension === 'webp') return 'image/webp';
  return 'image/png';
};

const parseSvgDimension = (value) => {
  const numeric = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

const getSvgDimensions = async (file) => {
  const markup = await file.text();
  const documentNode = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = documentNode.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') return null;

  const width = parseSvgDimension(svg.getAttribute('width'));
  const height = parseSvgDimension(svg.getAttribute('height'));
  if (width && height) return { width, height };

  const viewBox = String(svg.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite)) {
    const [, , viewBoxWidth, viewBoxHeight] = viewBox;
    if (viewBoxWidth > 0 && viewBoxHeight > 0) {
      return { width: width || viewBoxWidth, height: height || viewBoxHeight };
    }
  }
  return null;
};

export const createTokenLogoFromFile = async (file) => {
  if (!isSupportedTokenLogoFile(file)) {
    throw new Error('Upload a PNG, JPG, JPEG, SVG, or WebP image.');
  }
  if (file.size > TOKEN_LOGO_MAX_BYTES) {
    throw new Error('Maximum file size is 2 MB.');
  }

  const dataUrl = await readAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const svgDimensions =
    normalizeMimeType(file) === 'image/svg+xml' ? await getSvgDimensions(file) : null;
  const width = Number(svgDimensions?.width || image.naturalWidth || image.width || 0);
  const height = Number(svgDimensions?.height || image.naturalHeight || image.height || 0);

  if (width < TOKEN_LOGO_MIN_DIMENSION || height < TOKEN_LOGO_MIN_DIMENSION) {
    throw new Error('Image should be at least 256×256.');
  }
  if (width > TOKEN_LOGO_MAX_DIMENSION || height > TOKEN_LOGO_MAX_DIMENSION) {
    throw new Error('Image dimensions cannot exceed 4096×4096.');
  }

  return {
    name: file.name,
    type: normalizeMimeType(file),
    size: file.size,
    width,
    height,
    dataUrl,
    cropped: false,
  };
};

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The square crop could not be created.'));
      },
      type,
      quality,
    );
  });

const drawSquareCrop = (image, sourceSize, sourceX, sourceY, outputSize) => {
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The square crop could not be created.');
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize,
  );
  return canvas;
};

export const cropTokenLogoToSquare = async (logo) => {
  if (!logo?.dataUrl) throw new Error('Please upload a token logo.');

  const image = await loadImage(logo.dataUrl);
  const width = Number(image.naturalWidth || image.width || logo.width || 0);
  const height = Number(image.naturalHeight || image.height || logo.height || 0);
  const sourceSize = Math.min(width, height);
  const sourceX = Math.max(0, Math.floor((width - sourceSize) / 2));
  const sourceY = Math.max(0, Math.floor((height - sourceSize) / 2));
  let outputSize = Math.min(sourceSize, 2048);
  let blob;

  while (outputSize >= TOKEN_LOGO_MIN_DIMENSION) {
    const canvas = drawSquareCrop(image, sourceSize, sourceX, sourceY, outputSize);
    blob = await canvasToBlob(canvas, 'image/webp', 0.9);
    if (blob.size <= TOKEN_LOGO_MAX_BYTES || outputSize === TOKEN_LOGO_MIN_DIMENSION) break;
    outputSize = Math.max(TOKEN_LOGO_MIN_DIMENSION, Math.floor(outputSize * 0.8));
  }

  if (!blob || blob.size > TOKEN_LOGO_MAX_BYTES) {
    throw new Error('Maximum file size is 2 MB.');
  }

  const dataUrl = await readAsDataUrl(blob);
  const baseName = String(logo.name || 'token-logo').replace(/\.[^.]+$/, '');

  return {
    name: `${baseName}-square.webp`,
    type: 'image/webp',
    size: blob.size,
    width: outputSize,
    height: outputSize,
    dataUrl,
    cropped: true,
  };
};


const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('The token logo could not be prepared for upload.');
  return response.blob();
};

export const tokenLogoToFile = async (logo) => {
  if (!logo?.dataUrl) throw new Error('Please upload a token logo.');
  const blob = await dataUrlToBlob(logo.dataUrl);
  const type = logo.type || blob.type || 'image/webp';
  return new File([blob], logo.name || 'token-logo.webp', { type });
};

export const createTokenLogoFromBlob = async (blob, fileName = 'token-logo.webp') => {
  if (!(blob instanceof Blob) || !blob.size) {
    throw new Error('The saved token logo is unavailable.');
  }
  const type = blob.type || 'image/webp';
  return createTokenLogoFromFile(new File([blob], fileName, { type }));
};
