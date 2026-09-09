import { createLocalId } from '@/utils/createLocalId';
import { consumeMockFailure } from './investorMockService';

export const uploadMockDocument = (file, { onProgress, signal } = {}) =>
  new Promise((resolve, reject) => {
    const totalDuration = Math.round(800 + Math.random() * 700);
    const startedAt = Date.now();
    let timer = 0;

    const abort = () => {
      window.clearInterval(timer);
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener('abort', abort, { once: true });
    timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(95, Math.round((elapsed / totalDuration) * 100));
      onProgress?.(progress);
      if (elapsed < totalDuration) return;

      window.clearInterval(timer);
      signal?.removeEventListener('abort', abort);
      if (consumeMockFailure('upload')) {
        reject(new Error('The simulated upload failed. Retry the upload to continue.'));
        return;
      }
      onProgress?.(100);
      resolve({
        id: createLocalId('investor-upload'),
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'success',
        progress: 100,
        uploadedAt: new Date().toISOString(),
      });
    }, 120);
  });
