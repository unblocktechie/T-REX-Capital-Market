import { organizationDocumentService } from './organizationDocumentService';
import { ORGANIZATION_STATUSES, organizationStorageService } from './organizationStorageService';

export const organizationMockService = Object.freeze({
  markSubmitted() {
    return organizationStorageService.setSubmittedForTesting();
  },
  markVerified() {
    const current = organizationStorageService.get();
    if (current.status !== ORGANIZATION_STATUSES.SUBMITTED) return current;
    return organizationStorageService.markVerified();
  },
  async resetTestData() {
    await organizationDocumentService.clear().catch(() => undefined);
    return organizationStorageService.reset();
  },
});
