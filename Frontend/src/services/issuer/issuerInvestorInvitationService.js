import { investmentApi } from '@/api/investments';
import {
  extractInvitationList,
  mapInvitation,
  mapIssuerInvestor,
  normalizeInvitationMeta,
} from '@/api/investments/invitation.mapper';

export const issuerInvestorInvitationService = Object.freeze({
  async listInvestors({ tokenUid, page = 1, limit = 20, search = '', invitationStatus = 'all', signal } = {}) {
    const response = await investmentApi.listIssuerInvestors({ tokenUid, page, limit, search, invitationStatus, signal });
    const items = extractInvitationList(response?.data).map(mapIssuerInvestor);
    return {
      items,
      meta: normalizeInvitationMeta(response?.meta, { page, limit, itemCount: items.length }),
    };
  },

  async inviteInvestor(investorUid, tokenUid) {
    const response = await investmentApi.sendIssuerInvestorInvitation(investorUid, tokenUid);
    return {
      ...response,
      invitation: mapInvitation(response || {}),
    };
  },
});
