import { organizationApi } from '@/api/organization';

const triggerBlob = (blob, documentMeta, download) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  if (download) {
    anchor.download = documentMeta.fileName || 'organization-document';
  } else {
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export const organizationDocumentService = Object.freeze({
  async open(documentMeta, download = false) {
    const documentUid = documentMeta?.documentUid || documentMeta?.id;
    if (!documentUid) throw new Error('Document identifier is missing.');
    const response = await organizationApi.downloadDocument(documentUid);
    triggerBlob(response.data, documentMeta, download);
  },
});
