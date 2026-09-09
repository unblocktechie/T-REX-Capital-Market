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
import {
  removeInvestorDocumentFile,
  setInvestorDocumentFile,
  uploadMockDocument,
} from '@/services/investor';
import { cn } from '@/utils/cn';
import { createLocalId } from '@/utils/createLocalId';
import { formatFileSize } from '@/utils/investor';

const DEFAULT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const getOptionLabel = (options, value) =>
  options.find((option) => String(option.value) === String(value))?.label || value;

const validateFile = (file) => {
  const normalizedName = file.name.toLowerCase();
  const extensionAllowed = /\.(pdf|jpe?g|png)$/.test(normalizedName);
  if (!DEFAULT_TYPES.includes(file.type) && !extensionAllowed) {
    return 'Upload a PDF, JPG, JPEG, or PNG file.';
  }
  if (file.size > MAX_UPLOAD_BYTES) return 'File size must not exceed 10 MB.';
  if (!file.size) return 'The selected file is empty.';
  return '';
};

const buildUploadingFile = (file, documentType, documentTypeLabel) => ({
  id: createLocalId('investor-file'),
  name: file.name,
  size: file.size,
  type: file.type,
  documentType,
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

  const removeFile = (id) => {
    controllersRef.current.get(id)?.abort();
    controllersRef.current.delete(id);
    sourceFilesRef.current.delete(id);
    removeInvestorDocumentFile(id);
    emitFiles(filesRef.current.filter((file) => file.id !== id));
    setLocalError('');
  };

  const uploadFile = async (file, selectedType, existingId = '') => {
    if (!selectedType) {
      setLocalError('Select a document type before uploading a file.');
      return;
    }
    const validationError = validateFile(file);
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
    const uploading = buildUploadingFile(file, selectedType, documentTypeLabelText);
    if (existingId) uploading.id = existingId;
    sourceFilesRef.current.set(uploading.id, file);
    await setInvestorDocumentFile(uploading.id, file);

    const nextFiles = existingId
      ? filesRef.current.map((item) => (item.id === existingId ? uploading : item))
      : [...filesRef.current, uploading];
    emitFiles(nextFiles);

    const controller = new AbortController();
    controllersRef.current.set(uploading.id, controller);

    try {
      const uploaded = await uploadMockDocument(file, {
        signal: controller.signal,
        onProgress: (progress) => updateFile(uploading.id, { progress }),
      });
      if (!uploaded?.id) throw new Error('The upload service returned an empty response. Retry the upload.');
      updateFile(uploading.id, {
        ...uploaded,
        id: uploading.id,
        documentType: selectedType,
        documentTypeLabel: documentTypeLabelText,
      });
      onDocumentTypeChange?.('');
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
    if (sourceFile) {
      uploadFile(sourceFile, fileItem.documentType, fileItem.id);
    } else {
      setLocalError('Select the file again to retry this restored upload.');
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
        />
        <div className="investor-typed-upload-note">{selectionHint}</div>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        className="investor-upload-field__native"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
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
            return (
              <article key={file.id} className={cn('investor-file-item', file.status === 'error' && 'is-error')}>
                <span className="investor-file-item__icon"><FileIcon size={20} /></span>
                <div className="investor-file-item__copy">
                  <strong title={file.name}>{file.name}</strong>
                  <div className="investor-file-item__meta">
                    <span className="investor-file-type-chip">{file.documentTypeLabel || 'Supporting document'}</span>
                    <small>
                      {formatFileSize(file.size)} · {file.status === 'uploading' ? `Uploading ${file.progress || 0}%` : file.status === 'error' ? file.error || 'Upload failed' : 'Upload complete'}
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
                    <button type="button" onClick={() => chooseReplacement(file)} aria-label={`Replace ${file.name}`}><RefreshCw size={17} /></button>
                  ) : null}
                  {file.status === 'error' ? (
                    <button type="button" onClick={() => retryFile(file)} aria-label={`Retry ${file.name}`}><RefreshCw size={17} /></button>
                  ) : null}
                  {file.status === 'uploading' ? (
                    <button type="button" onClick={() => controllersRef.current.get(file.id)?.abort()} aria-label={`Cancel ${file.name}`}><X size={17} /></button>
                  ) : null}
                  <button type="button" onClick={() => removeFile(file.id)} aria-label={`Remove ${file.name}`}><Trash2 size={17} /></button>
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
