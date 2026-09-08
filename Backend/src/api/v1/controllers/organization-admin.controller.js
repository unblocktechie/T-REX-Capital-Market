const { sendSuccess } = require('../../../utils/response');

const createOrganizationAdminController = (service) => ({
  list: async (req, res) => {
    const result = await service.listApplications(req.query);
    return sendSuccess(req, res, {
      message: 'Submitted organization applications fetched successfully.',
      data: result.rows,
      meta: { pagination: result.pagination },
    });
  },
  getByUid: async (req, res) => sendSuccess(req, res, {
    message: 'Organization application fetched successfully.',
    data: await service.getApplication(req.params.organizationUid),
  }),
  documentFile: async (req, res, next) => {
    const result = await service.getDocumentFile(req.params.organizationUid, req.params.documentUid);
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.query.disposition === 'attachment') {
      return res.download(result.filePath, result.document.originalFileName, (error) => {
        if (error && !res.headersSent) next(error);
      });
    }
    res.type(result.document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(result.document.originalFileName)}`,
    );
    return res.sendFile(result.filePath, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
  review: async (req, res) => {
    const organization = await service.reviewApplication(req.params.organizationUid, req.body);
    return sendSuccess(req, res, {
      message: req.body.status === 'approved'
        ? organization.contractTxnMessage
        : 'Organization application rejected successfully.',
      data: organization,
    });
  },
});

module.exports = { createOrganizationAdminController };
