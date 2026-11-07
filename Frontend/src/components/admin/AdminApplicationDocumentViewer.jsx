import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, LoaderCircle, ShieldAlert } from 'lucide-react';
import { adminMonitoringApi } from '@/api/admin';
import { getErrorMessage } from '@/utils/error';

const supportedImages = new Set(['image/png', 'image/jpeg', 'image/webp']);
const supportedPreviewType = (type, fileName) => {
  const mime = String(type || '').split(';')[0].trim().toLowerCase();
  if (mime === 'application/pdf' || supportedImages.has(mime)) return mime;
  if (mime !== 'application/octet-stream' && mime !== '') return '';
  const extension = String(fileName || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension] || '';
};

export const triggerAdminDocumentDownload = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'application-document';
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function AdminApplicationDocumentViewer({ interestUid, document }) {
  const [resource, setResource] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let url = '';
    setLoading(true);
    setError('');
    setResource(null);
    setPreviewUrl('');
    adminMonitoringApi.downloadApplicationDocument(interestUid, document).then((response) => {
      if (!active) return;
      if (!(response.blob instanceof Blob)) throw new Error('The document response was not a file.');
      const previewType = supportedPreviewType(response.contentType, response.fileName);
      if (previewType) {
        url = URL.createObjectURL(new Blob([response.blob], { type: previewType }));
        setPreviewUrl(url);
      }
      setResource({ ...response, previewType });
    }).catch((reason) => {
      if (active) setError(reason?.response?.status === 403
        ? 'Your admin account does not have permission to view this document.'
        : reason?.response?.status === 404
          ? 'This document is unavailable or is no longer part of this application.'
          : getErrorMessage(reason, 'Could not load the secure document.'));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [interestUid, document, attempt]);

  const name = resource?.fileName || document?.originalFileName || document?.documentTypeName || 'Document';
  const metadata = useMemo(() => [document?.documentTypeName, document?.versionNumber ? `Version ${document.versionNumber}` : null].filter(Boolean).join(' · '), [document]);
  return <div className="space-y-4">
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h3 className="m-0 break-words text-sm font-semibold text-slate-900">{name}</h3><p className="m-0 mt-1 text-xs text-slate-500">{metadata || 'Application document'} · Private admin access</p></div>
      <button type="button" disabled={!resource} onClick={() => triggerAdminDocumentDownload(resource.blob, resource.fileName)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"><Download className="size-4" aria-hidden="true"/>Download</button>
    </div>
    {loading && <div role="status" aria-busy="true" className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600"><LoaderCircle className="size-7 animate-spin text-blue-600"/>Loading secure document…</div>}
    {!loading && error && <div role="alert" className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5 text-center text-sm text-rose-700"><ShieldAlert className="size-7"/><p className="m-0">{error}</p><button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-lg border border-rose-200 bg-white px-4 py-2 font-semibold">Try again</button></div>}
    {!loading && !error && resource && (resource.previewType === 'application/pdf' ?
      <iframe title={`Preview of ${name}`} src={previewUrl} sandbox="allow-downloads" className="h-[55dvh] min-h-[300px] w-full rounded-xl border border-slate-200 bg-white sm:h-[60dvh]" />
      : supportedImages.has(resource.previewType) ?
        <div className="flex max-h-[65dvh] min-h-48 items-center justify-center overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3"><img alt={`Preview of ${name}`} src={previewUrl} className="max-h-[58dvh] max-w-full object-contain"/></div>
        : <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-600"><FileText className="size-8"/><strong>Preview is not available for this file type</strong><p className="m-0">You can download the original file using the button above.</p></div>)}
  </div>;
}
