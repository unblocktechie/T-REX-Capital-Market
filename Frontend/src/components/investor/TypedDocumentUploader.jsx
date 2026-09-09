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
import { SelectField } from '@/components/organization/OrganizationFields';
import { Button } from '@/components/ui/Button';
import { MAX_UPLOAD_BYTES } from '@/constants/investor';
import { cn } from '@/utils/cn';
import { createLocalId } from '@/utils/createLocalId';
import { getErrorMessage } from '@/utils/error';
import { formatFileSize } from '@/utils/investor';

const DEFAULT_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

const getOptionLabel = (options, value) =>
  options.find((option) => String(option.value) === String(value))?.label || value;

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

const validateFile = async (file) => {
  const extension = fileExtension(file.name);
  const extensionAllowed = ['pdf', 'jpg', 'jpeg', 'png'].includes(extension);
  if (!extensionAllowed || (file.type && !DEFAULT_TYPES.includes(file.type))) {
    return 'Only PDF, JPG, JPEG, or PNG files are allowed.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'File size must not exceed 10 MB.';
  if (!file.size) return 'The selected file is empty.';

  try {
    if (!(await hasSupportedFileSignature(file, extension))) {
      return 'The selected file does not appear to be a valid PDF, JPG, JPEG, or PNG file.';
    }
  } catch {
    return 'Unable to validate the selected file. Please choose another PDF or image.';
  }

  return '';
};

const buildUploadingFile = (file, documentType, documentTypeLabel, id = '') => ({
  id: id || createLocalId('investor-file'),
  documentUid: '',
  name: file.name,
  size: file.size,
  type: file.type,
  documentType,
  documentTypeUid: documentType,
  documentTypeLabel,
  status: 'uploading',
  progress: 0,
  uploadedAt: '',
  error: '',
});

export function TypedDocumentUploader({
  label,
  description,
  documentTypeLabel = 'Document Type',
  documentTypeOptions = [],
  documentTypeValue,
  onDocumentTypeChange,
  value,
  onChange,
  onUpload,
  onDelete,
  error,
  disabled = false,
  selectionHint = 'Select a document type first, then upload the matching supporting file. You can add more than one supporting document.',
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const controllersRef = useRef(new Map());
  const sourceFilesRef = useRef(new Map());
  const replaceTargetRef = useRef('');
  const replaceDocumentTypeRef = useRef('');
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState('');
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const files = useMemo(() => value || [], [value]);
  const filesRef = useRef(files);
  filesRef.current = files;

  const emitFiles = (nextFiles) => {
    filesRef.current = nextFiles;
    onChange(nextFiles);
  };

  const updateFile = (id, patch) => {
    const nextFiles = filesRef.current.map((file) => (file.id === id ? { ...file, ...patch } : file));
    emitFiles(nextFiles);
  };

  const removeFile = async (fileItem) => {
    const id = fileItem.id;
    controllersRef.current.get(id)?.abort();
    controllersRef.current.delete(id);

    const serverUid = fileItem.documentUid || (fileItem.status === 'success' ? fileItem.id : '');
    if (serverUid && onDelete) {
      setDeletingIds((current) => new Set(current).add(id));
      setLocalError('');
      try {
        await onDelete(serverUid);
      } catch (deleteError) {
        setLocalError(getErrorMessage(deleteError, 'Unable to remove the uploaded document.'));
        return;
      } finally {
        setDeletingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    }

    sourceFilesRef.current.delete(id);
    emitFiles(filesRef.current.filter((file) => file.id !== id));
    setLocalError('');
  };

  const uploadFile = async (file, selectedType, existingId = '') => {
    if (!selectedType) {
      setLocalError('Select a document type before uploading a file.');
      return;
    }
    if (!onUpload) {
      setLocalError('Document upload is unavailable. Refresh the page and try again.');
      return;
    }
    const validationError = await validateFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    const duplicate = filesRef.current.some(
      (item) => item.id !== existingId && item.documentType === selectedType,
    );
    if (duplicate) {
      setLocalError('This document type has already been added. Replace the existing file or remove it first.');
      return;
    }

    setLocalError('');
    const documentTypeLabelText = getOptionLabel(documentTypeOptions, selectedType);
    const previousItem = existingId
      ? filesRef.current.find((item) => item.id === existingId) || null
      : null;
    const uploading = buildUploadingFile(file, selectedType, documentTypeLabelText, existingId);
    sourceFilesRef.current.set(uploading.id, file);

    const nextFiles = existingId
      ? filesRef.current.map((item) => (item.id === existingId ? uploading : item))
      : [...filesRef.current, uploading];
    emitFiles(nextFiles);

    const controller = new AbortController();
    controllersRef.current.set(uploading.id, controller);

    try {
      const uploaded = await onUpload(
        selectedType,
        file,
        (progressEvent) => {
          const total = Number(progressEvent?.total) || file.size || 1;
          const loaded = Number(progressEvent?.loaded) || 0;
          const progress = Math.min(99, Math.max(0, Math.round((loaded / total) * 100)));
          updateFile(uploading.id, { progress });
        },
        controller.signal,
      );
      if (!uploaded?.id) throw new Error('The upload service returned an empty document record.');

      const currentId = uploading.id;
      const completed = {
        ...uploading,
        ...uploaded,
        documentType: uploaded.documentType || selectedType,
        documentTypeUid: uploaded.documentTypeUid || selectedType,
        documentTypeLabel: uploaded.documentTypeLabel || documentTypeLabelText,
        status: 'success',
        progress: 100,
        error: '',
      };
      const completedFiles = filesRef.current.map((item) =>
        item.id === currentId ? completed : item,
      );
      emitFiles(completedFiles);
      sourceFilesRef.current.delete(currentId);
      onDocumentTypeChange?.('');
    } catch (uploadError) {
      const cancelled =
        uploadError?.name === 'AbortError' ||
        uploadError?.name === 'CanceledError' ||
        uploadError?.code === 'ERR_CANCELED';
      if (previousItem) {
        emitFiles(filesRef.current.map((item) => (item.id === uploading.id ? previousItem : item)));
        setLocalError(
          cancelled
            ? 'Replacement upload cancelled. The previous document is still saved.'
            : getErrorMessage(uploadError, 'Replacement failed. The previous document is still saved.'),
        );
      } else {
        updateFile(uploading.id, {
          status: 'error',
          progress: 0,
          error: cancelled
            ? 'Upload cancelled.'
            : getErrorMessage(uploadError, 'Upload failed. Retry to continue.'),
        });
      }
    } finally {
      controllersRef.current.delete(uploading.id);
    }
  };

  const retryFile = (fileItem) => {
    const sourceFile = sourceFilesRef.current.get(fileItem.id);
    if (sourceFile) {
      uploadFile(sourceFile, fileItem.documentType, fileItem.id);
    } else {
      setLocalError('Select the file again to retry this upload.');
      replaceTargetRef.current = fileItem.id;
      replaceDocumentTypeRef.current = fileItem.documentType || '';
      inputRef.current?.click();
    }
  };

  const handleFiles = (fileList) => {
    const [file] = Array.from(fileList || []);
    if (!file) return;
    const replaceTarget = replaceTargetRef.current;
    const forcedType = replaceDocumentTypeRef.current || documentTypeValue;
    replaceTargetRef.current = '';
    replaceDocumentTypeRef.current = '';
    uploadFile(file, forcedType, replaceTarget);
    if (inputRef.current) inputRef.current.value = '';
  };

  const chooseReplacement = (fileItem) => {
    replaceTargetRef.current = fileItem.id;
    replaceDocumentTypeRef.current = fileItem.documentType || '';
    inputRef.current?.click();
  };

  const describedBy = error || localError ? `${inputId}-error` : `${inputId}-hint`;

  return (
    <div className="investor-upload-field">
      {label || description ? (
        <div className="investor-upload-field__label">
          {label ? <label htmlFor={`${inputId}-type`}>{label}<span className="org-required-mark" aria-hidden="true">*</span></label> : null}
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}

      <div className="investor-typed-upload-layout">
        <SelectField
          id={`${inputId}-type`}
          label={documentTypeLabel}
          required
          options={documentTypeOptions}
          value={documentTypeValue}
          onChange={(event) => {
            onDocumentTypeChange?.(event.target.value);
            if (localError) setLocalError('');
          }}
          error={undefined}
          placeholder="Select document type"
          disabled={disabled}
        />
        <div className="investor-typed-upload-note">{selectionHint}</div>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        className="investor-upload-field__native"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/jpg,image/png"
        disabled={disabled}
        aria-describedby={describedBy}
        aria-label={label || 'Upload document'}
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
          <strong>Drag and drop a file here</strong>
          <p>PDF, JPG, JPEG, or PNG · Maximum 10 MB per file</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
          Browse files
        </Button>
      </div>

      <p id={`${inputId}-hint`} className="sr-only">Supported files are PDF, JPG, JPEG, and PNG, up to 10 MB.</p>
      {error || localError ? <p id={`${inputId}-error`} className="org-field__error" role="alert">{error || localError}</p> : null}

      {files.length ? (
        <div className="investor-file-list" aria-live="polite">
          {files.map((file) => {
            const FileIcon = file.type?.startsWith('image/') ? FileImage : FileText;
            const deleting = deletingIds.has(file.id);
            return (
              <article key={file.id} className={cn('investor-file-item', file.status === 'error' && 'is-error')}>
                <span className="investor-file-item__icon"><FileIcon size={20} /></span>
                <div className="investor-file-item__copy">
                  <strong title={file.name}>{file.name}</strong>
                  <div className="investor-file-item__meta">
                    <span className="investor-file-type-chip">{file.documentTypeLabel || 'Supporting document'}</span>
                    <small>
                      {formatFileSize(file.size)} · {deleting ? 'Removing…' : file.status === 'uploading' ? `Uploading ${file.progress || 0}%` : file.status === 'error' ? file.error || 'Upload failed' : 'Upload complete'}
                    </small>
                  </div>
                  {file.status === 'uploading' ? (
                    <div className="investor-file-progress" aria-label={`Upload ${file.progress || 0}% complete`}>
                      <i style={{ width: `${file.progress || 0}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="investor-file-item__actions">
                  {file.status === 'success' || file.status === 'verified' ? <CheckCircle2 size={19} className="investor-file-success" aria-label="Upload complete" /> : null}
                  {file.status === 'success' || file.status === 'verified' ? (
                    <button type="button" onClick={() => chooseReplacement(file)} aria-label={`Replace ${file.name}`} disabled={disabled || deleting}><RefreshCw size={17} /></button>
                  ) : null}
                  {file.status === 'error' ? (
                    <button type="button" onClick={() => retryFile(file)} aria-label={`Retry ${file.name}`} disabled={disabled || deleting}><RefreshCw size={17} /></button>
                  ) : null}
                  {file.status === 'uploading' ? (
                    <button type="button" onClick={() => controllersRef.current.get(file.id)?.abort()} aria-label={`Cancel ${file.name}`}><X size={17} /></button>
                  ) : null}
                  <button type="button" onClick={() => removeFile(file)} aria-label={`Remove ${file.name}`} disabled={disabled || deleting}><Trash2 size={17} /></button>
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
