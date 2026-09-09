import {
  Download,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { loadInvestorDocumentFile } from '@/services/investor';
import { formatFileSize } from '@/utils/investor';

const formatUploadedDate = (value) => {
  if (!value) return 'Uploaded in this session';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Uploaded';
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
};

const getDocumentLabel = (document) =>
  document.documentTypeLabel || document.documentType || 'Supporting document';

function DocumentReviewCard({ document, onPreview }) {
  const isImage = document.type?.startsWith('image/');
  const FileIcon = isImage ? FileImage : FileText;

  return (
    <article className="investor-document-review-card">
      <div className="investor-document-review-card__preview">
        <FileIcon size={34} strokeWidth={1.6} />
        <span>{document.categoryLabel}</span>
      </div>
      <div className="investor-document-review-card__body">
        <span className="investor-document-review-card__type">{getDocumentLabel(document)}</span>
        <h3 title={document.name}>{document.name}</h3>
        <p>{formatFileSize(document.size)} · {formatUploadedDate(document.uploadedAt)}</p>
        <div className="investor-document-review-card__actions">
          <Button variant="secondary" size="sm" icon={Eye} onClick={() => onPreview(document)}>
            Review
          </Button>
        </div>
      </div>
    </article>
  );
}

function InvestorDocumentPreviewModal({ document, onClose }) {
  const [sourceFile, setSourceFile] = useState(null);
  const [loadingSource, setLoadingSource] = useState(true);
  const [objectUrl, setObjectUrl] = useState('');
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadingSource(true);
    setSourceFile(null);
    setObjectUrl('');

    loadInvestorDocumentFile(document?.id)
      .then((file) => {
        if (active) setSourceFile(file);
      })
      .finally(() => {
        if (active) setLoadingSource(false);
      });

    return () => {
      active = false;
    };
  }, [document?.id]);

  useEffect(() => {
    if (!sourceFile) {
      setObjectUrl('');
      return undefined;
    }
    const nextUrl = URL.createObjectURL(sourceFile);
    setObjectUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [sourceFile]);

  const previewKind = useMemo(() => {
    const mime = String(sourceFile?.type || document?.type || '').toLowerCase();
    const name = String(document?.name || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(name)) return 'image';
    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    return 'file';
  }, [document?.name, document?.type, sourceFile?.type]);

  const downloadFile = () => {
    if (!sourceFile || !objectUrl) return;
    const anchor = window.document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = document.name || sourceFile.name || 'investor-document';
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

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
          <button type="button" className="is-primary" onClick={downloadFile} disabled={!sourceFile || !objectUrl}><Download size={16} />Download</button>
        </div>
      </div>

      <div className="investor-document-preview-stage">
        {loadingSource ? (
          <div className="investor-document-preview-empty" role="status" aria-live="polite">
            <span className="investor-document-preview-loader" aria-hidden="true" />
            <h3>Loading document preview</h3>
            <p>Retrieving the submitted file securely from this browser.</p>
          </div>
        ) : !sourceFile ? (
          <div className="investor-document-preview-empty">
            <FileText size={44} />
            <h3>Document preview is unavailable</h3>
            <p>This file was not stored in the browser preview vault. Return to the related onboarding step and select it again to enable preview.</p>
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
            <p>Download the document and open it with a compatible application.</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function InvestorDocumentReview({ identityDocuments = [], accreditationDocuments = [] }) {
  const [selectedDocument, setSelectedDocument] = useState(null);
  const groups = [
    {
      key: 'identity',
      title: 'Identity Documents',
      documents: identityDocuments.map((document) => ({ ...document, categoryLabel: 'Identity' })),
    },
    {
      key: 'accreditation',
      title: 'Accreditation Documents',
      documents: accreditationDocuments.map((document) => ({ ...document, categoryLabel: 'Accreditation' })),
    },
  ].filter((group) => group.documents.length);
  const documentCount = groups.reduce((total, group) => total + group.documents.length, 0);

  return (
    <>
      <Card className="investor-review-card investor-document-review">
        <header>
          <div>
            <h2>Document Review</h2>
            <p>Open each uploaded document and confirm that the selected document type and file are correct before creating your investor profile.</p>
          </div>
          <span className="investor-document-review__count">{documentCount}</span>
        </header>

        <div className="investor-document-review__groups">
          {groups.map((group) => (
            <section key={group.key} className="investor-document-review__group">
              <div className="investor-document-review__group-heading">
                <h3>{group.title}</h3>
                <span>{group.documents.length} {group.documents.length === 1 ? 'document' : 'documents'}</span>
              </div>
              <div className="investor-document-review__grid">
                {group.documents.map((document) => (
                  <DocumentReviewCard key={document.id} document={document} onPreview={setSelectedDocument} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

      {selectedDocument ? (
        <InvestorDocumentPreviewModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />
      ) : null}
    </>
  );
}
