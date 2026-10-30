import { apiClient } from '@/api/axios';
import { normalizeChainRecord } from '@/config/web3';
import { normalizePaymentTokenFields, normalizePaymentTokens } from '@/config/payment-tokens';

const unwrap = (response) => response.data?.data ?? response.data;
const rowsOf = (payload, key) => (Array.isArray(payload)
  ? payload
  : payload?.[key]
    || payload?.items
    || payload?.rows
    || payload?.records
    || payload?.auditLogs
    || payload?.chainMasterAudits
    || payload?.history
    || []);

const toMultipart = (payload, image) => {
  const formData = new FormData();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value) || (typeof value === 'object' && !(value instanceof File))) {
      formData.append(key, JSON.stringify(value));
      return;
    }
    formData.append(key, String(value));
  });
  if (image) formData.append('image', image);
  return formData;
};

const multipartConfig = { skipGlobalLoader: true, headers: { 'Content-Type': 'multipart/form-data' } };

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const addressList = (...values) => {
  for (const value of values) {
    if (Array.isArray(value)) {
      const addresses = value
        .map((item) => (typeof item === 'string' ? item : item?.contractAddress || item?.address || ''))
        .map((item) => String(item || '').trim())
        .filter(Boolean);
      if (addresses.length) return addresses;
    }
    if (typeof value === 'string' && value.trim()) {
      const addresses = value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      if (addresses.length) return addresses;
    }
  }
  return [];
};

const normalizeAdminChainDetail = (payload = {}) => {
  const row = payload?.chain || payload || {};
  const normalized = normalizeChainRecord(row) || row;
  const contracts = row.contracts && typeof row.contracts === 'object' ? row.contracts : {};
  const platform = contracts.platform && typeof contracts.platform === 'object' ? contracts.platform : {};
  const complianceModules = platform.complianceModules && typeof platform.complianceModules === 'object'
    ? platform.complianceModules
    : (row.complianceModules || {});
  const implementations = contracts.implementations && typeof contracts.implementations === 'object'
    ? contracts.implementations
    : (row.implementations || {});

  return {
    ...row,
    ...normalized,
    contractSuiteDeployedAt: firstText(
      row.contractSuiteDeployedAt,
      row.contractsDeployedAt,
      contracts.deployedAt,
    ),
    trexImplementationAuthorityAddress: firstText(
      row.trexImplementationAuthorityAddress,
      platform.trexImplementationAuthorityAddress,
      platform.trexImplementationAuthority,
    ),
    trexFactoryAddress: firstText(row.trexFactoryAddress, platform.trexFactoryAddress, platform.trexFactory),
    trexGatewayAddress: firstText(row.trexGatewayAddress, platform.trexGatewayAddress, platform.trexGateway),
    identityImplementationAuthorityAddress: firstText(
      row.identityImplementationAuthorityAddress,
      platform.identityImplementationAuthorityAddress,
      platform.identityImplementationAuthority,
    ),
    identityFactoryAddress: firstText(row.identityFactoryAddress, platform.identityFactoryAddress, platform.identityFactory),
    platformControllerAddress: firstText(
      row.platformControllerAddress,
      platform.platformControllerAddress,
      platform.platformController,
    ),
    platformControllerOwnerAddress: firstText(
      row.platformControllerOwnerAddress,
      platform.platformControllerOwnerAddress,
      platform.platformControllerOwner,
    ),
    countryRestrictModuleAddress: firstText(
      row.countryRestrictModuleAddress,
      complianceModules.countryRestrictModuleAddress,
      complianceModules.countryRestrict,
    ),
    maxBalanceModuleAddress: firstText(
      row.maxBalanceModuleAddress,
      complianceModules.maxBalanceModuleAddress,
      complianceModules.maxBalance,
    ),
    maxInvestorsModuleAddress: firstText(
      row.maxInvestorsModuleAddress,
      complianceModules.maxInvestorsModuleAddress,
      complianceModules.maxInvestors,
    ),
    idFactoryAccessManagerAddress: firstText(
      row.idFactoryAccessManagerAddress,
      platform.idFactoryAccessManagerAddress,
      platform.idFactoryAccessManager,
    ),
    idFactoryAccessManagerAdminAddress: firstText(
      row.idFactoryAccessManagerAdminAddress,
      platform.idFactoryAccessManagerAdminAddress,
      platform.idFactoryAccessManagerAdmin,
    ),
    tokenImplementationAddress: firstText(
      row.tokenImplementationAddress,
      implementations.tokenImplementationAddress,
      implementations.token,
    ),
    claimTopicsRegistryImplementationAddress: firstText(
      row.claimTopicsRegistryImplementationAddress,
      implementations.claimTopicsRegistryImplementationAddress,
      implementations.claimTopicsRegistry,
    ),
    identityRegistryImplementationAddress: firstText(
      row.identityRegistryImplementationAddress,
      implementations.identityRegistryImplementationAddress,
      implementations.identityRegistry,
    ),
    identityRegistryStorageImplementationAddress: firstText(
      row.identityRegistryStorageImplementationAddress,
      implementations.identityRegistryStorageImplementationAddress,
      implementations.identityRegistryStorage,
    ),
    trustedIssuersRegistryImplementationAddress: firstText(
      row.trustedIssuersRegistryImplementationAddress,
      implementations.trustedIssuersRegistryImplementationAddress,
      implementations.trustedIssuersRegistry,
    ),
    modularComplianceImplementationAddress: firstText(
      row.modularComplianceImplementationAddress,
      implementations.modularComplianceImplementationAddress,
      implementations.modularCompliance,
    ),
    identityImplementationAddress: firstText(
      row.identityImplementationAddress,
      implementations.identityImplementationAddress,
      implementations.identity,
    ),
    paymentTokenAddresses: addressList(
      row.paymentTokenAddresses,
      row.paymentTokens,
      platform.paymentTokenAddresses,
      platform.paymentTokens,
    ),
  };
};

export const adminNetworkApi = Object.freeze({
  listChains: () => apiClient.get('/admin/chains', { skipGlobalLoader: true })
    .then(unwrap)
    .then((payload) => rowsOf(payload, 'chains').map((row) => normalizeChainRecord(row) || row)),
  getChain: (chainUid) => apiClient
    .get(`/admin/chains/${encodeURIComponent(chainUid)}`, { skipGlobalLoader: true })
    .then(unwrap)
    .then(normalizeAdminChainDetail),
  createChain: (payload, image) => image
    ? apiClient.post('/admin/chains', toMultipart(payload, image), multipartConfig).then(unwrap)
    : apiClient.post('/admin/chains', payload, { skipGlobalLoader: true }).then(unwrap),
  updateChain: (chainUid, payload) => apiClient
    .patch(`/admin/chains/${encodeURIComponent(chainUid)}`, payload, { skipGlobalLoader: true })
    .then(unwrap),
  updateChainImage: (chainUid, image) => apiClient
    .put(`/admin/chains/${encodeURIComponent(chainUid)}/image`, toMultipart({}, image), multipartConfig)
    .then(unwrap),
  listChainAudits: (chainUid) => apiClient
    .get(`/admin/chains/${encodeURIComponent(chainUid)}/audits`, { skipGlobalLoader: true })
    .then(unwrap)
    .then((payload) => rowsOf(payload, 'audits')),

  listPaymentTokens: (chainUid, chainId) => apiClient
    .get('/admin/payment-tokens', { params: chainUid ? { chainUid } : {}, skipGlobalLoader: true })
    .then(unwrap)
    .then((payload) => normalizePaymentTokens(
      rowsOf(payload, 'paymentTokens').map((row) => ({
        ...row,
        chainUid: row.chainUid || chainUid,
        chainId: row.chainId || chainId,
      })),
    )),
  createPaymentToken: (payload, image) => image
    ? apiClient.post('/admin/payment-tokens', toMultipart(payload, image), multipartConfig).then(unwrap)
    : apiClient.post('/admin/payment-tokens', payload, { skipGlobalLoader: true }).then(unwrap),
  getPaymentToken: (paymentTokenUid) => apiClient
    .get(`/admin/payment-tokens/${encodeURIComponent(paymentTokenUid)}`, { skipGlobalLoader: true })
    .then(unwrap)
    .then((payload) => normalizePaymentTokenFields(payload?.paymentToken || payload?.token || payload || {})),
  updatePaymentToken: (paymentTokenUid, payload) => apiClient
    .patch(`/admin/payment-tokens/${encodeURIComponent(paymentTokenUid)}`, payload, { skipGlobalLoader: true })
    .then(unwrap),
  updatePaymentTokenImage: (paymentTokenUid, image) => apiClient
    .put(`/admin/payment-tokens/${encodeURIComponent(paymentTokenUid)}/image`, toMultipart({}, image), multipartConfig)
    .then(unwrap),
  deletePaymentToken: (paymentTokenUid) => apiClient
    .delete(`/admin/payment-tokens/${encodeURIComponent(paymentTokenUid)}`, { skipGlobalLoader: true })
    .then(unwrap),
});
