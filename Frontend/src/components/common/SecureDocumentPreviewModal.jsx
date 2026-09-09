import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/utils/error';

export function SecureDocumentPreviewModal({
  document,
  onClose,
  fetchDocumentBlob,
  loadingMessage = 'Retrieving the secure document preview.',
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [objectUrl, setObjectUrl] = useState('');
  const [contentType, setContentType] = useState('');
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!document || !fetchDocumentBlob) return undefined;
    let active = true;
    let nextUrl = '';
    setLoading(true);
    setLoadError('');
    setObjectUrl('');
    setScale(1);
    setRotation(0);

    Promise.resolve(fetchDocumentBlob(document))
      .then((result) => {
        if (!active) return;
        const blob = result?.blob instanceof Blob
          ? result.blob
          : new Blob([result?.blob || ''], {
              type: result?.contentType || document?.mimeType || 'application/octet-stream',
            });
        nextUrl = URL.createObjectURL(blob);
        setContentType(result?.contentType || blob.type || document?.mimeType || '');
        setObjectUrl(nextUrl);
      })
      .catch((error) => {
        if (active) setLoadError(getErrorMessage(error, 'Unable to load this document preview.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [document, fetchDocumentBlob]);

  const previewKind = useMemo(() => {
    const mime = String(contentType || document?.mimeType || '').toLowerCase();
    const name = String(document?.originalFileName || document?.file || document?.name || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(png|jpe?g)$/.test(name)) return 'image';
    if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
    return 'file';
  }, [contentType, document]);

  if (!document) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Document Preview"
      className="investor-document-preview-modal"
      bodyClassName="investor-document-preview-modal__body"
      trapFocus
    >
      <div className="investor-document-preview-toolbar">
        <div>
          <strong>{document.documentTypeName || document.name || 'Investor document'}</strong>
          <span>
            {[
              document.originalFileName || document.file,
              document.versionNumber ? `v${document.versionNumber}` : '',
              document.claimTopicCode,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="investor-document-preview-toolbar__actions">
          {previewKind === 'image' && objectUrl ? (
            <>
              <button type="button" onClick={() => setScale((value) => Math.max(0.5, value - 0.25))} aria-label="Zoom out" title="Zoom out"><ZoomOut size={17} /></button>
              <button type="button" onClick={() => setScale((value) => Math.min(3, value + 0.25))} aria-label="Zoom in" title="Zoom in"><ZoomIn size={17} /></button>
              <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate image" title="Rotate image"><RotateCw size={17} /></button>
              <button type="button" className="is-text" onClick={() => { setScale(1); setRotation(0); }}>Reset</button>
            </>
          ) : null}
          {objectUrl ? (
            <a
              href={objectUrl}
              target="_blank"
              rel="noreferrer"
              className="is-icon"
              aria-label="Open document in new tab"
              title="Open in new tab"
            >
              <ExternalLink size={17} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="investor-document-preview-stage">
        {loading ? (
          <div className="investor-document-preview-empty" role="status">
            <span className="investor-document-preview-loader" />
            <h3>Loading secure document preview</h3>
            <p>{loadingMessage}</p>
          </div>
        ) : loadError ? (
          <div className="investor-document-preview-empty" role="alert">
            <FileText size={42} />
            <h3>Preview unavailable</h3>
            <p>{loadError}</p>
          </div>
        ) : previewKind === 'image' && objectUrl ? (
          <div className="investor-document-preview-image-wrap">
            <img
              src={objectUrl}
              alt={document.documentTypeName || document.name || 'Investor document'}
              style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
            />
          </div>
        ) : previewKind === 'pdf' && objectUrl ? (
          <iframe src={objectUrl} title={document.documentTypeName || document.name || 'Investor document'} />
        ) : objectUrl ? (
          <div className="investor-document-preview-empty">
            <FileText size={42} />
            <h3>Inline preview is not supported</h3>
            <p>Use the external-open icon above to view this file in a compatible application.</p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
