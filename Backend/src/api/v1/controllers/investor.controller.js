const fs = require('node:fs');
const { sendSuccess } = require('../../../utils/response');

const removeUploadedFiles = (files = []) => Promise.all(files.map((file) => fs.promises.unlink(file.path).catch(() => {})));

const createInvestorController = (service, optionRepository) => ({
  options: async (req, res) => sendSuccess(req, res, {
    message: 'Investor onboarding options fetched successfully.',
    data: await optionRepository.listAll(),
  }),
  getMine: async (req, res) => sendSuccess(req, res, {
    message: 'Investor onboarding form fetched successfully.',
    data: await service.getFullForm(req.user),
  }),
  saveIdentity: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Identity details draft saved.' : 'Identity details saved.',
    data: await service.saveIdentity(req.user, req.body),
  }),
  saveCompliance: async (req, res) => sendSuccess(req, res, {
    message: req.body.isDraft ? 'Compliance questionnaire draft saved.' : 'Compliance questionnaire saved.',
    data: await service.saveCompliance(req.user, req.body),
  }),
  uploadDocuments: async (req, res) => {
    try {
      return sendSuccess(req, res, {
        statusCode: 201,
        message: 'Investor documents uploaded successfully.',
        data: await service.uploadDocuments(req.user, req.body.documentTypeUid, req.files),
      });
    } catch (error) {
      await removeUploadedFiles(req.files);
      throw error;
    }
  },
  listDocuments: async (req, res) => sendSuccess(req, res, {
    message: 'Investor documents fetched successfully.',
    data: await service.listDocuments(req.user),
  }),
  downloadDocument: async (req, res, next) => {
    const result = await service.getDocumentForDownload(req.user, req.params.documentUid);
    return res.download(result.filePath, result.document.originalFileName, (error) => {
      if (error && !res.headersSent) next(error);
    });
  },
  deleteDocument: async (req, res) => {
    await service.deleteDocument(req.user, req.params.documentUid);
    return sendSuccess(req, res, { message: 'Investor document deleted successfully.' });
  },
  submit: async (req, res) => sendSuccess(req, res, {
    message: 'Investor onboarding submitted successfully.',
    data: await service.submit(req.user, req.body),
  }),
});

module.exports = { createInvestorController, removeUploadedFiles };
