import { useRef, useState } from 'react';
import { FileUp, LoaderCircle, UploadCloud } from 'lucide-react';
import { SelectField } from './OrganizationFields';

export function DocumentUploader({
  documentType,
  documentTypeOptions = [],
  onDocumentTypeChange,
  onFileSelected,
  uploading,
  progress,
  error,
}) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files) => {
    if (uploading) return;
    const [file] = Array.from(files || []);
    if (file) onFileSelected(file);
  };

  const openPicker = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  return (
    <div className="org-document-uploader">
      <SelectField
        label="Document Type"
        required
        options={documentTypeOptions}
        value={documentType}
        onChange={(event) => onDocumentTypeChange(event.target.value)}
        error={!documentType && error?.includes('document type') ? error : undefined}
      />

      <p className="org-upload-field-label" id="organization-document-file-label">
        Upload File <span className="org-required-mark" aria-hidden="true">*</span>
      </p>

      <div
        className={`org-dropzone ${dragActive ? 'is-dragging' : ''} ${error ? 'is-error' : ''}`}
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-disabled={uploading}
        aria-labelledby="organization-document-file-label"
        aria-required="true"
        onClick={openPicker}
        onKeyDown={(event) => {
          if (!uploading && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!uploading) handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = '';
          }}
          hidden
        />
        <span className="org-dropzone__icon">
          {uploading ? <LoaderCircle size={28} className="button__spinner" /> : <UploadCloud size={28} />}
        </span>
        <h3>{uploading ? 'Securing document…' : 'Drag and drop your document'}</h3>
        <p>or click to browse from your device</p>
        <small>PDF, PNG, JPG or JPEG · Maximum 10 MB</small>
        {uploading ? (
          <div className="org-upload-progress" aria-label={`Upload progress ${progress}%`}>
            <span><i style={{ width: `${progress}%` }} /></span>
            <strong>{progress}%</strong>
          </div>
        ) : (
          <span className="button button--secondary button--sm" aria-hidden="true">
            <FileUp size={17} />
            Select file
          </span>
        )}
      </div>
      {error && !error.includes('document type') ? <p className="org-field__error" role="alert">{error}</p> : null}
    </div>
  );
}
