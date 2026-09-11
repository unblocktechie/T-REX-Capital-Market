import { investmentApi } from '@/api/investments';
import {
  extractInvitationList,
  mapInvestorInvitation,
  normalizeInvitationMeta,
} from '@/api/investments/invitation.mapper';

export const investorInvitationService = Object.freeze({
  async listInvitations({ page = 1, limit = 20, search = '', status = 'all', signal } = {}) {
    const response = await investmentApi.listMyInvitations({ page, limit, search, status, signal });
    const items = extractInvitationList(response?.data).map(mapInvestorInvitation);
    return {
      items,
      meta: normalizeInvitationMeta(response?.meta, { page, limit, itemCount: items.length }),
    };
  },

  async getInvitation(invitationUid) {
    return mapInvestorInvitation(await investmentApi.getMyInvitation(invitationUid));
  },

  async markViewed(invitationUid) {
    return mapInvestorInvitation(await investmentApi.markMyInvitationViewed(invitationUid));
  },
});
