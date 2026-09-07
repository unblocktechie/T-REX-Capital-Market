const fs = require('node:fs');
const { sendSuccess } = require('../../../utils/response');

const removeUploadedFiles = (files = []) => Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));

const createOrganizationController = (service, optionRepository) => ({
  options: async (req, res) => sendSuccess(req, res, {
    message: 'Organization form options fetched successfully.', data: await optionRepository.listAll(),
  }),
  getMine: async (req, res) => sendSuccess(req, res, {
    message: 'Organization form fetched successfully.', data: await service.getFullForm(req.user),
  }),
  markUserNotified: async (req, res) => sendSuccess(req, res, {
    message: 'Organization user notification marked successfully.',
    data: await service.markUserNotified(req.user),
  }),
  saveCompanyInformation: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Company information draft saved.' : 'Company information saved.',
    data: await service.saveCompanyInformation(req.user, req.body),
  }),
  saveJurisdiction: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Jurisdiction draft saved.' : 'Jurisdiction information saved.',
    data: await service.saveJurisdiction(req.user, req.body),
  }),
  saveBeneficialOwners: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Beneficial-owner draft saved.' : 'Beneficial owners saved.',
    data: await service.saveBeneficialOwners(req.user, req.body),
  }),
  uploadDocuments: async (req, res) => {
    try {
      return sendSuccess(req, res, {
        statusCode: 201, message: 'Organization documents uploaded successfully.',
        data: await service.uploadDocuments(req.user, req.body.documentTypeUid, req.files),
      });
    } catch (error) {
      await removeUploadedFiles(req.files);
      throw error;
    }
  },
  listDocuments: async (req, res) => sendSuccess(req, res, {
    message: 'Organization documents fetched successfully.', data: await service.listDocuments(req.user),
  }),
  downloadDocument: async (req, res, next) => {
    const result = await service.getDocumentForDownload(req.user, req.params.documentUid);
    return res.download(result.filePath, result.document.originalFileName, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
  deleteDocument: async (req, res) => {
    await service.deleteDocument(req.user, req.params.documentUid);
    return sendSuccess(req, res, { message: 'Organization document deleted successfully.' });
  },
  submit: async (req, res) => sendSuccess(req, res, {
    message: 'Organization submitted successfully for review.', data: await service.submit(req.user, req.body),
  }),
});

module.exports = { createOrganizationController, removeUploadedFiles };
