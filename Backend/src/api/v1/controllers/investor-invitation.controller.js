const { sendSuccess } = require('../../../utils/response');

const createInvestorInvitationController = (service) => ({
  issuerInvestors: async (req, res) => {
    const result = await service.listIssuerInvestors(req.user, req.query);
    return sendSuccess(req, res, {
      message: 'Completed investors fetched successfully.',
      data: result.items,
      meta: { ...result.pagination, token: result.token },
    });
  },
  invite: async (req, res) => {
    const result = await service.invite(req.user, req.params.investorUid, req.body);
    return sendSuccess(req, res, {
      statusCode: result.alreadyExisted ? 200 : 201,
      message: result.processing
        ? 'Invitation email delivery is already in progress.'
        : (result.emailSent ? 'Investor invitation sent successfully.' : 'Investor invitation already exists.'),
      data: result,
    });
  },
  investorList: async (req, res) => {
    const result = await service.listInvestorInvitations(req.user, req.query);
    return sendSuccess(req, res, {
      message: 'Your investor invitations fetched successfully.',
      data: result.items,
      meta: result.pagination,
    });
  },
  investorGet: async (req, res) => sendSuccess(req, res, {
    message: 'Investor invitation fetched successfully.',
    data: await service.getInvestorInvitation(req.user, req.params.invitationUid),
  }),
  investorViewed: async (req, res) => sendSuccess(req, res, {
    message: 'Investor invitation marked as viewed.',
    data: await service.viewInvestorInvitation(req.user, req.params.invitationUid),
  }),
});

module.exports = { createInvestorInvitationController };
