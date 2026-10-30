import { isAddress, zeroAddress } from 'viem';

const creationStatuses = new Set([
  'readytodeploy', 'processing', 'deploymentpending', 'deploymentconfirmed',
  'deploymentfailed', 'configurationpending', 'configurationfailed',
  'priceconfirmationrequired', 'deployed', 'completed', 'active', 'success',
]);

// A saved draft/payment address is not evidence of token creation.
// Keep the existing creation/recovery boundary locked once creation starts.
export const isTokenCreationLocked = (...records) => records.some((record) => {
  if (!record) return false;
  const sources = [record, record.deployment, record.result, record.token, record.pendingSync];
  return sources.filter(Boolean).some((source) => {
    const status = String(source.status || '').toLowerCase().replace(/[^a-z]/g, '');
    const tokenAddress = source.tokenAddress || source.contractAddress;
    const transactionHash = String(source.transactionHash || '').trim();
    const hasBroadcast = /^0x[0-9a-f]{64}$/i.test(transactionHash) && !/^0x0{64}$/i.test(transactionHash);
    return source.isLocked === true || hasBroadcast || creationStatuses.has(status)
      || Boolean(tokenAddress && isAddress(tokenAddress, { strict: false }) && tokenAddress.toLowerCase() !== zeroAddress);
  });
});
