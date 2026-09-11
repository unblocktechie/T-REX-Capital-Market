import { Download, Eye, FileCheck2, FileText, RefreshCw, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export function UploadedDocumentList({ documents, onPreview, onDownload, onRemove, onReplace, readOnly = false }) {
  if (!documents.length) {
    return (
      <div className="org-documents-empty">
        <EmptyState
          title="No documents uploaded yet"
          description="Add the legal documents required to verify your organization."
        />
      </div>
    );
  }

  return (
    <div className="org-document-list">
      {documents.map((document) => (
        <article className="org-document-row" key={document.id}>
          <span className="org-document-row__icon">
            {readOnly ? <FileCheck2 size={21} /> : <FileText size={21} />}
          </span>
          <div className="org-document-row__copy">
            <strong>{document.fileName}</strong>
            <span>{document.documentType}</span>
            <small>
              {formatBytes(document.fileSize)} · {new Date(document.uploadedAt).toLocaleDateString()}
              {readOnly ? ' · Submitted' : ''}
            </small>
          </div>
          <div className="org-document-row__actions">
            <button className="icon-button" type="button" onClick={() => onPreview(document)} aria-label={`Preview ${document.fileName}`} title="Preview">
              <Eye size={17} />
            </button>
            {onDownload ? (
              <button className="icon-button" type="button" onClick={() => onDownload(document)} aria-label={`Download ${document.fileName}`} title="Download">
                <Download size={17} />
              </button>
            ) : null}
            {!readOnly && onReplace ? (
              <button className="icon-button" type="button" onClick={() => onReplace(document)} aria-label={`Replace ${document.fileName}`} title="Replace">
                <RefreshCw size={17} />
              </button>
            ) : null}
            {!readOnly && onRemove ? (
              <button className="icon-button org-document-row__remove" type="button" onClick={() => onRemove(document)} aria-label={`Remove ${document.fileName}`} title="Remove">
                <Trash2 size={17} />
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
