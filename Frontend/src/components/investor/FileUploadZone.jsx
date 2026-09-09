import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  FileText,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { MAX_UPLOAD_BYTES } from '@/constants/investor';
import { uploadMockDocument } from '@/services/investor';
import { cn } from '@/utils/cn';
import { createLocalId } from '@/utils/createLocalId';
import { formatFileSize } from '@/utils/investor';

const DEFAULT_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

const fileExtension = (name = '') => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

const hasSupportedFileSignature = async (file, extension) => {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (extension === 'pdf') {
    return bytes.length >= 5 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === 'png') {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return png.every((byte, index) => bytes[index] === byte);
  }
  return false;
};

const validateFile = async (file, imageOnly) => {
  const allowedTypes = imageOnly ? IMAGE_TYPES : DEFAULT_TYPES;
  const extension = fileExtension(file.name);
  const allowedExtensions = imageOnly ? ['jpg', 'jpeg', 'png'] : ['pdf', 'jpg', 'jpeg', 'png'];
  if (!allowedExtensions.includes(extension) || (file.type && !allowedTypes.includes(file.type))) {
    return imageOnly
      ? 'Only JPG, JPEG, or PNG images are allowed.'
      : 'Only PDF, JPG, JPEG, or PNG files are allowed.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'File size must not exceed 10 MB.';
  if (!file.size) return 'The selected file is empty.';

  try {
    if (!(await hasSupportedFileSignature(file, extension))) {
      return imageOnly
        ? 'The selected file does not appear to be a valid JPG, JPEG, or PNG image.'
        : 'The selected file does not appear to be a valid PDF, JPG, JPEG, or PNG file.';
    }
  } catch {
    return 'Unable to validate the selected file. Please choose another supported file.';
  }

  return '';
};

const buildUploadingFile = (file, previewUrl = '') => ({
  id: createLocalId('investor-file'),
  name: file.name,
  size: file.size,
  type: file.type,
  status: 'uploading',
  progress: 0,
  uploadedAt: '',
  previewUrl,
  error: '',
});

export function FileUploadZone({
  label,
  description,
  value,
  onChange,
  error,
  multiple = false,
  imageOnly = false,
  disabled = false,
  onUploadComplete,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const controllersRef = useRef(new Map());
  const sourceFilesRef = useRef(new Map());
  const replaceTargetRef = useRef('');
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState('');
  const files = useMemo(() => (multiple ? value || [] : value ? [value] : []), [multiple, value]);
  const filesRef = useRef(files);
  filesRef.current = files;

  const emitFiles = (nextFiles) => {
    filesRef.current = nextFiles;
    onChange(multiple ? nextFiles : nextFiles[0] || null);
  };

  const updateFile = (id, patch) => {
    const nextFiles = filesRef.current.map((file) => (file.id === id ? { ...file, ...patch } : file));
    emitFiles(nextFiles);
  };

  const removeFile = (id) => {
    controllersRef.current.get(id)?.abort();
    controllersRef.current.delete(id);
    sourceFilesRef.current.delete(id);
    const removed = filesRef.current.find((file) => file.id === id);
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl);
    emitFiles(filesRef.current.filter((file) => file.id !== id));
    setLocalError('');
  };

  const uploadFile = async (file, existingId = '') => {
    const validationError = await validateFile(file, imageOnly);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError('');

    const previousFile = existingId ? filesRef.current.find((item) => item.id === existingId) : null;
    if (previousFile?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previousFile.previewUrl);
    const previewUrl = imageOnly || file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    const uploading = buildUploadingFile(file, previewUrl);
    if (existingId) uploading.id = existingId;
    sourceFilesRef.current.set(uploading.id, file);
    const currentFiles = filesRef.current;
    const nextFiles = multiple
      ? existingId
        ? currentFiles.map((item) => (item.id === existingId ? uploading : item))
        : [...currentFiles, uploading]
      : [uploading];
    emitFiles(nextFiles);

    const controller = new AbortController();
    controllersRef.current.set(uploading.id, controller);
    try {
      const uploaded = await uploadMockDocument(file, {
        signal: controller.signal,
        onProgress: (progress) => updateFile(uploading.id, { progress }),
      });
      if (!uploaded?.id) throw new Error('The upload service returned an empty response. Retry the upload.');
      const completeFile = { ...uploaded, id: uploading.id, previewUrl };
      updateFile(uploading.id, completeFile);
      onUploadComplete?.(completeFile, file);
    } catch (uploadError) {
      if (uploadError.name === 'AbortError') {
        updateFile(uploading.id, { status: 'error', progress: 0, error: 'Upload cancelled.' });
      } else {
        updateFile(uploading.id, {
          status: 'error',
          progress: 0,
          error: uploadError.message || 'Upload failed. Retry to continue.',
        });
      }
    } finally {
      controllersRef.current.delete(uploading.id);
    }
  };

  const retryFile = (fileItem) => {
    const sourceFile = sourceFilesRef.current.get(fileItem.id);
    if (sourceFile) uploadFile(sourceFile, fileItem.id);
    else {
      setLocalError('Select the file again to retry this restored upload.');
      inputRef.current?.click();
    }
  };

  const handleFiles = (fileList) => {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    const replaceTarget = replaceTargetRef.current;
    replaceTargetRef.current = '';
    if (replaceTarget) {
      uploadFile(selected[0], replaceTarget);
      selected.slice(1).forEach((file) => uploadFile(file));
    } else if (!multiple) uploadFile(selected[0]);
    else selected.forEach((file) => uploadFile(file));
    if (inputRef.current) inputRef.current.value = '';
  };

  const chooseReplacement = (id) => {
    replaceTargetRef.current = id;
    inputRef.current?.click();
  };

  const accept = imageOnly ? '.jpg,.jpeg,.png,image/jpeg,image/jpg,image/png' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/jpg,image/png';
  const describedBy = error || localError ? `${inputId}-error` : `${inputId}-hint`;

  return (
    <div className="investor-upload-field">
      <div className="investor-upload-field__label">
        <label htmlFor={inputId}>{label}<span className="org-required-mark" aria-hidden="true">*</span></label>
        {description ? <p>{description}</p> : null}
      </div>

      <input
        ref={inputRef}
        id={inputId}
        className="investor-upload-field__native"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => handleFiles(event.target.files)}
      />

      <div
        className={cn('investor-upload-zone', dragActive && 'is-dragging', (error || localError) && 'is-error', disabled && 'is-disabled')}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!disabled) handleFiles(event.dataTransfer.files);
        }}
      >
        <span className="investor-upload-zone__icon"><UploadCloud size={26} /></span>
        <div>
          <strong>Drag and drop {multiple ? 'files' : 'a file'} here</strong>
          <p>{imageOnly ? 'JPG, JPEG, or PNG' : 'PDF, JPG, JPEG, or PNG'} · Maximum 10 MB {multiple ? 'per file' : ''}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
          Browse {multiple ? 'files' : 'file'}
        </Button>
      </div>

      <p id={`${inputId}-hint`} className="sr-only">Supported files are {imageOnly ? 'JPG, JPEG, and PNG' : 'PDF, JPG, JPEG, and PNG'}, up to 10 MB.</p>
      {error || localError ? <p id={`${inputId}-error`} className="org-field__error" role="alert">{error || localError}</p> : null}

      {files.length ? (
        <div className="investor-file-list" aria-live="polite">
          {files.map((file) => {
            const FileIcon = file.type?.startsWith('image/') ? FileImage : FileText;
            return (
              <article key={file.id} className={cn('investor-file-item', file.status === 'error' && 'is-error')}>
                {file.previewUrl ? (
                  <img src={file.previewUrl} alt="Selected file preview" />
                ) : (
                  <span className="investor-file-item__icon"><FileIcon size={20} /></span>
                )}
                <div className="investor-file-item__copy">
                  <strong title={file.name}>{file.name}</strong>
                  <small>{formatFileSize(file.size)} · {file.status === 'uploading' ? `Uploading ${file.progress || 0}%` : file.status === 'error' ? file.error || 'Upload failed' : 'Upload complete'}</small>
                  {file.status === 'uploading' ? (
                    <div className="investor-file-progress" aria-label={`Upload ${file.progress || 0}% complete`}>
                      <i style={{ width: `${file.progress || 0}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="investor-file-item__actions">
                  {file.status === 'success' || file.status === 'verified' ? <CheckCircle2 size={19} className="investor-file-success" aria-label="Upload complete" /> : null}
                  {file.status === 'success' || file.status === 'verified' ? (
                    <button type="button" onClick={() => chooseReplacement(file.id)} aria-label={`Replace ${file.name}`}><RefreshCw size={17} /></button>
                  ) : null}
                  {file.status === 'error' ? (
                    <button type="button" onClick={() => retryFile(file)} aria-label={`Retry ${file.name}`}><RefreshCw size={17} /></button>
                  ) : null}
                  {file.status === 'uploading' ? (
                    <button type="button" onClick={() => controllersRef.current.get(file.id)?.abort()} aria-label={`Cancel ${file.name}`}><X size={17} /></button>
                  ) : (
                    <button type="button" onClick={() => removeFile(file.id)} aria-label={`Remove ${file.name}`}><Trash2 size={17} /></button>
                  )}
                </div>
                {file.status === 'error' ? <AlertCircle size={18} className="investor-file-error-icon" aria-hidden="true" /> : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
