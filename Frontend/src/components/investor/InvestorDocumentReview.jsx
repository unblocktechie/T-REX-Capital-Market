import {
  CheckCircle2,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/utils/error';
import { formatFileSize } from '@/utils/investor';

const formatUploadedDate = (value) => {
  if (!value) return 'Upload complete';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Upload complete';
  return `Uploaded ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)}`;
};

const getDocumentLabel = (document) =>
  document.documentTypeLabel || document.documentType || 'Supporting document';

function InvestorDocumentPreviewModal({ document, onClose, downloadDocument }) {
  const [sourceBlob, setSourceBlob] = useState(null);
  const [loadingSource, setLoadingSource] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [objectUrl, setObjectUrl] = useState('');
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadingSource(true);
    setSourceBlob(null);
    setLoadError('');
    setObjectUrl('');

    const documentUid = document?.documentUid || document?.id;
    if (!documentUid || !downloadDocument) {
      setLoadingSource(false);
      setLoadError('A secure preview is not available for this document.');
      return () => { active = false; };
    }

    downloadDocument(documentUid)
      .then((response) => {
        if (!active) return;
        const blob = response?.data instanceof Blob
          ? response.data
          : new Blob([response?.data || ''], {
              type: response?.headers?.['content-type'] || document?.type || 'application/octet-stream',
            });
        setSourceBlob(blob);
      })
      .catch((error) => {
        if (active) setLoadError(getErrorMessage(error, 'Unable to load the document preview.'));
      })
      .finally(() => {
        if (active) setLoadingSource(false);
      });

    return () => {
      active = false;
    };
  }, [document?.documentUid, document?.id, document?.type, downloadDocument]);

  useEffect(() => {
    if (!sourceBlob) {
      setObjectUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(sourceBlob);
    setObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [sourceBlob]);

  const previewKind = useMemo(() => {
    const mime = String(sourceBlob?.type || document?.type || '').toLowerCase();
    const name = String(document?.name || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(png|jpe?g)$/.test(name)) return 'image';
    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    return 'file';
  }, [document?.name, document?.type, sourceBlob?.type]);

  const resetPreview = () => {
    setScale(1);
    setRotation(0);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={getDocumentLabel(document)}
      className="investor-document-preview-modal"
      bodyClassName="investor-document-preview-modal__body"
      trapFocus
    >
      <div className="investor-document-preview-toolbar">
        <div>
          <strong>{document.name}</strong>
          <span>{document.categoryLabel} · {formatFileSize(document.size)}</span>
        </div>
        <div className="investor-document-preview-toolbar__actions">
          {previewKind === 'image' && objectUrl ? (
            <>
              <button type="button" onClick={() => setScale((value) => Math.max(0.5, value - 0.25))} aria-label="Zoom out" title="Zoom out"><ZoomOut size={17} /></button>
              <button type="button" onClick={() => setScale((value) => Math.min(3, value + 0.25))} aria-label="Zoom in" title="Zoom in"><ZoomIn size={17} /></button>
              <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate image" title="Rotate image"><RotateCw size={17} /></button>
              <button type="button" className="is-text" onClick={resetPreview}>Reset</button>
            </>
          ) : null}
          {objectUrl ? (
            <a href={objectUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Open</a>
          ) : null}
        </div>
      </div>

      <div className="investor-document-preview-stage">
        {loadingSource ? (
          <div className="investor-document-preview-empty" role="status" aria-live="polite">
            <span className="investor-document-preview-loader" aria-hidden="true" />
            <h3>Loading secure document preview</h3>
            <p>Retrieving your uploaded file securely.</p>
          </div>
        ) : loadError ? (
          <div className="investor-document-preview-empty" role="alert">
            <FileText size={44} />
            <h3>Document preview is unavailable</h3>
            <p>{loadError}</p>
          </div>
        ) : previewKind === 'image' && objectUrl ? (
          <div className="investor-document-preview-image-wrap">
            <img
              src={objectUrl}
              alt={getDocumentLabel(document)}
              style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
            />
          </div>
        ) : previewKind === 'pdf' && objectUrl ? (
          <iframe src={objectUrl} title={getDocumentLabel(document)} />
        ) : objectUrl ? (
          <div className="investor-document-preview-empty">
            <FileText size={44} />
            <h3>Inline preview is not supported</h3>
            <p>Open the document in a compatible browser or application.</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function InvestorDocumentList({
  documents = [],
  title,
  categoryLabel,
  downloadDocument,
}) {
  const [selectedDocument, setSelectedDocument] = useState(null);
  const countLabel = `${documents.length} ${documents.length === 1 ? 'document' : 'documents'} uploaded`;

  return (
    <>
      <section className="investor-review-document-list" aria-label={title}>
        <div className="investor-review-document-list__heading">
          <div>
            <span>{title}</span>
            <strong>{countLabel}</strong>
          </div>
        </div>

        {documents.length ? (
          <div className="investor-file-list investor-review-document-list__rows">
            {documents.map((document) => {
              const isImage = document.type?.startsWith('image/');
              const FileIcon = isImage ? FileImage : FileText;
              const previewDocument = { ...document, categoryLabel };

              return (
                <article key={document.documentUid || document.id} className="investor-file-item investor-review-document-row">
                  <span className="investor-file-item__icon"><FileIcon size={20} /></span>
                  <div className="investor-file-item__copy">
                    <strong title={document.name}>{document.name}</strong>
                    <div className="investor-file-item__meta">
                      <span className="investor-file-type-chip">{getDocumentLabel(document)}</span>
                      <small>{formatFileSize(document.size)} · {formatUploadedDate(document.uploadedAt)}</small>
                    </div>
                  </div>
                  <div className="investor-file-item__actions investor-review-document-row__actions">
                    <CheckCircle2 size={19} className="investor-file-success" aria-label="Upload complete" />
                    <button
                      type="button"
                      onClick={() => setSelectedDocument(previewDocument)}
                      aria-label={`View ${document.name}`}
                      title="View document"
                    >
                      <Eye size={18} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="investor-review-document-list__empty">No documents uploaded.</p>
        )}
      </section>

      {selectedDocument ? (
        <InvestorDocumentPreviewModal
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          downloadDocument={downloadDocument}
        />
      ) : null}
    </>
  );
}

// Kept as a compatibility wrapper in case this component is reused elsewhere later.
export function InvestorDocumentReview({
  identityDocuments = [],
  accreditationDocuments = [],
  downloadDocument,
}) {
  return (
    <div className="investor-review-document-groups">
      <InvestorDocumentList
        documents={identityDocuments}
        title="Uploaded Identity Documents"
        categoryLabel="Identity"
        downloadDocument={downloadDocument}
      />
      <InvestorDocumentList
        documents={accreditationDocuments}
        title="Uploaded Accreditation Documents"
        categoryLabel="Accreditation"
        downloadDocument={downloadDocument}
      />
    </div>
  );
}
