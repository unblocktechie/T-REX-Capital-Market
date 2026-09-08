import {
  AlertTriangle,
  CheckCircle2,
  Crop,
  ImagePlus,
  LoaderCircle,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import {
  createTokenLogoFromFile,
  cropTokenLogoToSquare,
  isSquareTokenLogo,
  TOKEN_LOGO_ACCEPT,
} from '@/utils/tokenLogo';

export function TokenLogoUploader({ value, onChange, error, onInteraction }) {
  const inputRef = useRef(null);
  const [localError, setLocalError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const square = isSquareTokenLogo(value);
  const visibleError = localError || error;

  const selectFile = async (file) => {
    if (!file || processing) return;
    onInteraction?.();
    setLocalError('');
    setProcessing(true);
    try {
      const nextLogo = await createTokenLogoFromFile(file);
      onChange(nextLogo);
    } catch (selectionError) {
      setLocalError(selectionError?.message || 'The selected image could not be uploaded.');
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleCrop = async () => {
    if (!value || processing) return;
    onInteraction?.();
    setLocalError('');
    setProcessing(true);
    try {
      onChange(await cropTokenLogoToSquare(value));
    } catch (cropError) {
      setLocalError(cropError?.message || 'The square crop could not be created.');
    } finally {
      setProcessing(false);
    }
  };

  const removeLogo = () => {
    if (processing) return;
    onInteraction?.();
    setLocalError('');
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className="issuance-field issuance-field--full token-logo-field">
      <label className="issuance-field__label" htmlFor="token-logo-input">
        Token Logo<span className="issuance-required" aria-hidden="true">*</span>
      </label>

      <div
        className={cn(
          'token-logo-uploader',
          dragActive && 'is-dragging',
          visibleError && 'has-error',
          value && 'has-logo',
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) setDragActive(false);
        }}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id="token-logo-input"
          className="sr-only"
          type="file"
          accept={TOKEN_LOGO_ACCEPT}
          disabled={processing}
          onChange={(event) => selectFile(event.target.files?.[0])}
          aria-invalid={Boolean(visibleError)}
          aria-describedby="token-logo-message token-logo-requirements"
        />

        <div className="token-logo-preview" aria-live="polite">
          {value?.dataUrl ? (
            <img src={value.dataUrl} alt="Uploaded token logo preview" />
          ) : (
            <ImagePlus size={25} aria-hidden="true" />
          )}
          {processing ? (
            <span className="token-logo-preview__loading" aria-label="Processing token logo">
              <LoaderCircle size={19} />
            </span>
          ) : null}
        </div>

        <div className="token-logo-uploader__content">
          <div className="token-logo-uploader__heading">
            <strong>{value?.name || 'Upload a token logo'}</strong>
            {value ? (
              <span>
                {value.width}×{value.height}px · {(value.size / 1024).toFixed(0)} KB
              </span>
            ) : (
              <span>Drag and drop an image here, or select one from your device.</span>
            )}
          </div>

          <div className="token-logo-uploader__actions">
            <button
              type="button"
              className="token-logo-action token-logo-action--primary"
              onClick={() => inputRef.current?.click()}
              disabled={processing}
            >
              <Upload size={15} /> {value ? 'Replace Image' : 'Upload Image'}
            </button>
            {value && !square ? (
              <button
                type="button"
                className="token-logo-action"
                onClick={handleCrop}
                disabled={processing}
              >
                <Crop size={15} /> Crop to Square
              </button>
            ) : null}
            {value ? (
              <button
                type="button"
                className="token-logo-action token-logo-action--danger"
                onClick={removeLogo}
                disabled={processing}
                aria-label="Remove token logo"
              >
                <Trash2 size={15} /> Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {visibleError ? (
        <p id="token-logo-message" className="issuance-field__error" role="alert">
          {visibleError}
        </p>
      ) : value && !square ? (
        <p id="token-logo-message" className="token-logo-message token-logo-message--warning">
          <AlertTriangle size={14} /> A 1:1 square logo is recommended. Use automatic crop to
          keep the centered area.
        </p>
      ) : value ? (
        <p id="token-logo-message" className="token-logo-message token-logo-message--success">
          <CheckCircle2 size={14} /> Logo is ready to use.
        </p>
      ) : null}

      <p id="token-logo-requirements" className="issuance-field__hint">
        PNG, JPG, JPEG, SVG, or WebP · Maximum 2 MB · 256–4096 px per side · 1:1 preferred
      </p>
    </div>
  );
}
