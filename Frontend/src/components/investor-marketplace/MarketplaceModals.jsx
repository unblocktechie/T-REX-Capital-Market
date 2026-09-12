import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  FileCheck2,
  FileText,
  Info,
  Trash2,
  UploadCloud,
  UserRoundCheck,
} from 'lucide-react';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MAX_UPLOAD_BYTES } from '@/constants/investor';
import { getErrorMessage } from '@/utils/error';

const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const SUPPORTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png']);

const topicIcon = (code) => code === 'ACCREDITED_INVESTOR' ? BadgeCheck : UserRoundCheck;
const topicLabel = (topic) => topic?.label || String(topic?.claimTopicCode || 'Required verification').replaceAll('_', ' ');
const optionUid = (option) => String(option?.documentTypeUid || option?.value || '').trim();
const optionLabel = (option) => option?.label || option?.documentTypeName || optionUid(option);

const fileExtension = (name = '') => String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';

const hasSupportedSignature = async (file, extension) => {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (extension === 'pdf') {
    return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === 'png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  return false;
};

const validateUploadFile = async (file) => {
  if (!file) return 'Choose a document to upload.';
  const extension = fileExtension(file.name);
  if (!SUPPORTED_EXTENSIONS.has(extension) || (file.type && !SUPPORTED_MIME_TYPES.has(file.type))) {
    return 'Only PDF, JPG, JPEG, or PNG files are allowed.';
  }
  if (!file.size) return 'The selected file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return 'File size must not exceed 10 MB.';
  try {
    if (!(await hasSupportedSignature(file, extension))) {
      return 'The selected file does not appear to be a valid PDF, JPG, JPEG, or PNG file.';
    }
  } catch {
    return 'Unable to validate this file. Please choose another PDF or image.';
  }
  return '';
};

const documentTypeMatchesTopic = (option, claimTopicCode) => {
  const code = String(option?.claimTopicCode || '').trim().toUpperCase();
  if (code) return code === claimTopicCode;
  const category = String(option?.documentCategory || option?.category || '').trim().toLowerCase();
  if (claimTopicCode === 'KYC') return ['kyc', 'identity', 'identity_document'].includes(category);
  if (claimTopicCode === 'ACCREDITED_INVESTOR') return ['accredited', 'accreditation'].includes(category);
  return false;
};

export function UploadMissingDocumentsModal({
  open,
  onClose,
  verification,
  documentTypes = [],
  documentTypesLoading = false,
  onUpload,
  onComplete,
  completing = false,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const topics = verification?.topics || [];
  const initialOutstandingTopics = useMemo(
    () => topics.filter((topic) => topic.rejected || topic.missing || !topic.satisfied),
    [topics],
  );
  const [selectedClaimCode, setSelectedClaimCode] = useState('');
  const [selectedDocumentTypeUid, setSelectedDocumentTypeUid] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [removingDocumentKey, setRemovingDocumentKey] = useState('');
  const [confirmRemoveKey, setConfirmRemoveKey] = useState('');
  const [localError, setLocalError] = useState('');

  const locallyUploadedClaimCodes = useMemo(
    () => new Set(uploadedFiles.map((file) => String(file.claimTopicCode || '').toUpperCase()).filter(Boolean)),
    [uploadedFiles],
  );
  const outstandingTopics = useMemo(
    () => initialOutstandingTopics.filter((topic) => !locallyUploadedClaimCodes.has(String(topic.claimTopicCode || '').toUpperCase())),
    [initialOutstandingTopics, locallyUploadedClaimCodes],
  );

  useEffect(() => {
    if (!open) return;
    const nextClaimCode = outstandingTopics[0]?.claimTopicCode || '';
    setSelectedClaimCode((current) => (
      current && outstandingTopics.some((topic) => topic.claimTopicCode === current)
        ? current
        : nextClaimCode
    ));
  }, [open, outstandingTopics]);

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      setSelectedClaimCode('');
      setSelectedDocumentTypeUid('');
      setUploadedFiles([]);
      setDragActive(false);
      setUploading(false);
      setUploadProgress(0);
      setRemovingDocumentKey('');
      setConfirmRemoveKey('');
      setLocalError('');
    }
  }, [open]);

  useEffect(() => {
    setSelectedDocumentTypeUid('');
    setConfirmRemoveKey('');
    setLocalError('');
  }, [selectedClaimCode]);

  const selectedTopic = outstandingTopics.find((topic) => topic.claimTopicCode === selectedClaimCode) || outstandingTopics[0] || null;
  const matchingDocumentTypes = documentTypes.filter((option) => documentTypeMatchesTopic(option, selectedTopic?.claimTopicCode));
  const claimTopicOptions = outstandingTopics.map((topic) => ({
    value: topic.claimTopicCode,
    label: topicLabel(topic),
    description: topic.rejected ? 'Replacement requested by issuer' : 'Required for this offering',
  }));
  const documentTypeOptions = matchingDocumentTypes.map((option) => ({
    value: optionUid(option),
    label: optionLabel(option),
    description: option?.description || option?.documentTypeDescription || '',
  }));

  const displayedDocuments = uploadedFiles;

  const canComplete = !uploading && !removingDocumentKey && !documentTypesLoading && outstandingTopics.length === 0 && uploadedFiles.length > 0;

  const uploadFile = async (file) => {
    if (!selectedTopic) {
      setLocalError('All required verification documents are already complete.');
      return;
    }
    if (!selectedDocumentTypeUid) {
      setLocalError('Select a document type before uploading.');
      return;
    }

    const validationError = await validateUploadFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError('');
    setConfirmRemoveKey('');
    const localId = `staged-${selectedDocumentTypeUid}-${Date.now()}`;
    setUploadedFiles((current) => [
      ...current,
      {
        id: localId,
        documentUid: '',
        file,
        name: file.name,
        documentTypeUid: selectedDocumentTypeUid,
        documentTypeLabel: optionLabel(documentTypes.find((option) => optionUid(option) === selectedDocumentTypeUid)),
        claimTopicCode: selectedTopic.claimTopicCode,
        claimTopicLabel: topicLabel(selectedTopic),
        uploadedAt: '',
      },
    ]);
    setSelectedDocumentTypeUid('');
    if (inputRef.current) inputRef.current.value = '';

    const nextOutstanding = initialOutstandingTopics.find((topic) => (
      String(topic.claimTopicCode || '').toUpperCase() !== String(selectedTopic.claimTopicCode || '').toUpperCase()
      && !uploadedFiles.some((item) => String(item.claimTopicCode || '').toUpperCase() === String(topic.claimTopicCode || '').toUpperCase())
    ));
    if (nextOutstanding?.claimTopicCode) setSelectedClaimCode(nextOutstanding.claimTopicCode);
  };

  const handleFiles = (files) => {
    const [file] = Array.from(files || []);
    if (file) void uploadFile(file);
  };

  const handleClose = () => {
    abortControllerRef.current?.abort();
    onClose?.();
  };

  const handleComplete = async () => {
    if (!canComplete || !uploadedFiles.length) {
      setLocalError('Select all requested replacement documents before submitting the interest.');
      return;
    }
    if (!onUpload) {
      setLocalError('Document upload is currently unavailable.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setLocalError('');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      for (let index = 0; index < uploadedFiles.length; index += 1) {
        const staged = uploadedFiles[index];
        const baseProgress = (index / uploadedFiles.length) * 100;
        const sliceProgress = 100 / uploadedFiles.length;
        await onUpload(
          staged.documentTypeUid,
          staged.file,
          (event) => {
            const total = Number(event?.total) || staged.file?.size || 1;
            const loaded = Number(event?.loaded) || 0;
            const fileProgress = Math.min(1, Math.max(0, loaded / total));
            setUploadProgress(Math.min(99, Math.round(baseProgress + (fileProgress * sliceProgress))));
          },
          controller.signal,
        );
      }
      setUploadProgress(100);
      await onComplete?.();
    } catch (error) {
      const cancelled = error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';
      if (!cancelled) setLocalError(getErrorMessage(error, 'Unable to upload the requested document.'));
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
      setUploading(false);
    }
  };

  const handleRemove = async (file) => {
    const key = String(file.documentUid || file.id || '');
    if (!key) return;

    if (confirmRemoveKey !== key) {
      setConfirmRemoveKey(key);
      setLocalError('');
      return;
    }

    setRemovingDocumentKey(key);
    setLocalError('');
    setUploadedFiles((current) => current.filter((item) => String(item.documentUid || item.id) !== key));
    if (file.claimTopicCode) setSelectedClaimCode(file.claimTopicCode);
    setConfirmRemoveKey('');
    setRemovingDocumentKey('');
  };

  const rejection = verification?.rejection;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={String(rejection?.rejectReasonType || '').toUpperCase() === 'DOC_REJECTED' ? 'Upload Requested Documents' : 'Upload Missing Documents'}
      className="marketplace-upload-modal sm:max-w-lg"
      bodyClassName="marketplace-upload-modal__body"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={handleClose} disabled={uploading || completing || Boolean(removingDocumentKey)}>Cancel</Button>
          <Button onClick={handleComplete} loading={completing || uploading} disabled={!canComplete}>Request to Invest</Button>
        </>
      )}
    >
      <div className="marketplace-upload-stack">
        <p className="marketplace-modal-copy">This issuer requires documents that are currently missing or need to be replaced in your investor profile.</p>

        <div className="marketplace-upload-progress-card">
          <span>Verification Progress</span>
          <div className="marketplace-upload-progress-list">
            {topics.length ? topics.map((topic) => {
              const Icon = topicIcon(topic.claimTopicCode);
              const rejected = topic.rejected === true;
              const locallySelected = locallyUploadedClaimCodes.has(String(topic.claimTopicCode || '').toUpperCase());
              const ready = (topic.satisfied && !rejected) || locallySelected;
              return (
                <div key={topic.id || topic.claimTopicCode} className={ready ? 'is-complete' : 'is-required'}>
                  <span><Icon size={15} /> {topicLabel(topic)}</span>
                  <strong>{locallySelected ? 'Ready to submit' : rejected ? 'Re-upload' : ready ? 'Uploaded' : 'Required'}</strong>
                </div>
              );
            }) : <div className="is-required"><span><UserRoundCheck size={15} /> Required investor document</span><strong>Required</strong></div>}
          </div>
        </div>

        {rejection?.rejectReason ? (
          <div className="marketplace-upload-rejection-note">
            <AlertCircle size={16} />
            <div><strong>Issuer request</strong><span>{rejection.rejectReason}</span></div>
          </div>
        ) : null}

        {rejection?.resubmitRemaining != null ? (
          <p className="marketplace-upload-attempts">Resubmission attempts remaining: <strong>{rejection.resubmitRemaining}</strong></p>
        ) : null}

        {outstandingTopics.length > 1 ? (
          <div className="marketplace-upload-field">
            <span>Verification Requirement</span>
            <MarketplaceDropdown
              value={selectedClaimCode}
              options={claimTopicOptions}
              onChange={setSelectedClaimCode}
              ariaLabel="Select verification requirement"
              className="marketplace-upload-dropdown"
              disabled={uploading || Boolean(removingDocumentKey)}
            />
          </div>
        ) : selectedTopic ? (
          <p className="marketplace-upload-claim-label">Verification Requirement: <strong>{topicLabel(selectedTopic)}</strong></p>
        ) : null}

        {selectedTopic ? (
          <div className="marketplace-upload-field">
            <span>Select Document Type</span>
            <MarketplaceDropdown
              value={selectedDocumentTypeUid}
              options={documentTypeOptions}
              onChange={setSelectedDocumentTypeUid}
              ariaLabel={`Select document type for ${topicLabel(selectedTopic)}`}
              placeholder={documentTypesLoading ? 'Loading document types…' : 'Select document type'}
              className="marketplace-upload-dropdown"
              disabled={uploading || documentTypesLoading || Boolean(removingDocumentKey) || !documentTypeOptions.length}
            />
            {!documentTypesLoading && !matchingDocumentTypes.length ? <small>No document type is configured for this verification requirement. Please contact support.</small> : null}
          </div>
        ) : null}

        {selectedTopic ? (
          <div
            className={`marketplace-upload-dropzone${dragActive ? ' is-dragging' : ''}${uploading ? ' is-uploading' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); if (!uploading) setDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); if (!uploading) setDragActive(true); }}
            onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (!uploading) handleFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              disabled={uploading || Boolean(removingDocumentKey) || !selectedDocumentTypeUid}
              onChange={(event) => handleFiles(event.target.files)}
            />
            <label htmlFor={inputId} aria-disabled={uploading || Boolean(removingDocumentKey) || !selectedDocumentTypeUid}>
              <UploadCloud size={24} />
              <strong>{uploading ? `Uploading… ${uploadProgress}%` : 'Click to upload or drag and drop'}</strong>
              <span>PDF, PNG, JPG or JPEG (max. 10 MB)</span>
            </label>
            {uploading ? <div className="marketplace-upload-progress-bar"><span style={{ width: `${uploadProgress}%` }} /></div> : null}
          </div>
        ) : null}

        {displayedDocuments.length ? (
          <div className="marketplace-upload-success-section">
            <span>Selected Documents</span>
            {displayedDocuments.map((file) => {
              const documentKey = String(file.documentUid || file.id);
              const confirmingRemove = confirmRemoveKey === documentKey;
              const removing = removingDocumentKey === documentKey;
              return (
                <div className="marketplace-upload-success-row" key={documentKey}>
                  <div className="marketplace-upload-document-main">
                    <FileText size={15} />
                    <span>
                      <strong>{file.name}</strong>
                      <small>
                        <span className="marketplace-upload-claim-chip">{file.claimTopicLabel || file.claimTopicCode || 'Verification requirement'}</span>
                        <span>{file.documentTypeLabel || 'Uploaded document'}</span>
                      </small>
                    </span>
                  </div>
                  <div className="marketplace-upload-document-actions">
                    {!confirmingRemove ? <CheckCircle2 size={16} className="marketplace-upload-document-check" /> : null}
                    {confirmingRemove ? (
                      <div className="marketplace-upload-remove-confirm" role="group" aria-label={`Confirm removal of ${file.name}`}>
                        <button type="button" onClick={() => setConfirmRemoveKey('')} disabled={removing}>Cancel</button>
                        <button type="button" className="is-danger" onClick={() => void handleRemove(file)} disabled={removing}>{removing ? 'Removing…' : 'Remove'}</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="marketplace-upload-remove-button"
                        onClick={() => void handleRemove(file)}
                        disabled={uploading || Boolean(removingDocumentKey)}
                        aria-label={`Remove ${file.name}`}
                        title="Remove document"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="marketplace-upload-save-note"><Info size={16} /><span>Only documents selected for this request are shown here. You can remove or replace them before submitting the interest.</span></div>
        {localError ? <div className="marketplace-upload-error" role="alert"><AlertCircle size={15} /><span>{localError}</span></div> : null}
      </div>
    </Modal>
  );
}

// Compatibility export for older imports. The modal now supports direct, backend-backed document upload.
export const CompleteVerificationModal = UploadMissingDocumentsModal;

export function SubmitInterestModal({ open, onClose, token, onConfirm, loading = false, note = '', onNoteChange, requiredTopics = [] }) {
  if (!token) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request to Invest"
      className="sm:max-w-lg"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={onConfirm} loading={loading}>Request to Invest</Button>
        </>
      )}
    >
      <div className="marketplace-modal-stack">
        <div className="marketplace-modal-hero-icon"><FileCheck2 size={21} /></div>
        <p className="marketplace-modal-copy">Your verified profile and selected documents will be available to <strong>{token.issuer}</strong> for review. Submitting interest does not make an investment or move any funds.</p>
        {requiredTopics.length ? (
          <div>
            <span className="marketplace-modal-label">Required Verification</span>
            <div className="marketplace-modal-document-list">
              {requiredTopics.map((topic) => {
                const Icon = topicIcon(topic.claimTopicCode);
                return <span key={topic.id || topic.claimTopicCode}><Icon size={15} /> {topicLabel(topic)}</span>;
              })}
            </div>
          </div>
        ) : null}
        <label className="marketplace-interest-note-field">
          <span>Note to issuer <small>Optional</small></span>
          <textarea value={note} onChange={(event) => onNoteChange?.(event.target.value)} placeholder="Add any context you want the issuer to review with this interest." rows={3} />
        </label>
      </div>
    </Modal>
  );
}

export function SubmitClaimsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Required Documents" className="sm:max-w-lg" trapFocus footer={<Button onClick={onClose}>Close</Button>}>
      <div className="marketplace-modal-stack"><p className="marketplace-modal-copy">Complete each verification requirement by uploading a matching investor document.</p></div>
    </Modal>
  );
}
