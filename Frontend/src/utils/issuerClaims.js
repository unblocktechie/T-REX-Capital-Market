import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  stringToHex,
} from 'viem';

export const ISSUER_CLAIM_SIGNING_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SIGNING: 'SIGNING',
  VERIFYING: 'VERIFYING',
  SIGNED: 'SIGNED',
  FAILED: 'FAILED',
});

export const createApprovedClaimData = () => stringToHex('KYC_APPROVED');

export const getClaimTopicValue = (topic) => {
  if (typeof topic === 'number' && Number.isSafeInteger(topic) && topic >= 0) return topic;
  if (typeof topic === 'bigint' && topic >= 0n && topic <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(topic);
  }

  const candidates = [
    typeof topic === 'string' ? topic : undefined,
    topic?.claimTopic,
    topic?.claimTopicValue,
    topic?.claim_topic_value,
    topic?.topic,
    topic?.topicValue,
    topic?.topic_value,
    topic?.numericValue,
    topic?.numeric_value,
    topic?.claimTopic?.claimTopicValue,
    topic?.claimTopic?.claim_topic_value,
    topic?.claimTopic?.topicValue,
    topic?.claimTopic?.value,
    topic?.value,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0) {
      return candidate;
    }
    const normalized = String(candidate ?? '').trim();
    if (/^\d+$/.test(normalized)) {
      const value = Number(normalized);
      if (Number.isSafeInteger(value) && value >= 0) return value;
    }
  }

  return null;
};

export const getClaimTopicLabel = (topic, index = 0) =>
  String(
    topic?.label ||
      topic?.claimTopicName ||
      topic?.name ||
      topic?.claimTopicCode ||
      topic?.code ||
      `Claim Topic ${getClaimTopicValue(topic) ?? index + 1}`,
  ).replaceAll('_', ' ');

/**
 * Build the ERC-3643 / ONCHAINID claim digest that the issuer wallet signs.
 * The wallet's personal_sign/signMessage step applies the Ethereum signed-message prefix.
 */
export const buildClaimDigest = (investorIdentityAddress, claimTopic, data) => {
  if (!isAddress(investorIdentityAddress)) {
    throw new Error('A valid investor identity contract address is required before signing.');
  }

  const normalizedTopic = getClaimTopicValue({ claimTopic });
  if (normalizedTopic === null) {
    throw new Error('A valid numeric claim topic is required before signing.');
  }

  if (typeof data !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) {
    throw new Error('Claim data must be valid hex bytes.');
  }

  return keccak256(
    encodeAbiParameters(
      [
        { name: 'identity', type: 'address' },
        { name: 'claimTopic', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
      [getAddress(investorIdentityAddress), BigInt(normalizedTopic), data],
    ),
  );
};

export const addressesMatch = (left, right) =>
  Boolean(left && right && String(left).toLowerCase() === String(right).toLowerCase());

export const isWalletSignatureRejected = (error) => {
  const code = error?.code ?? error?.cause?.code ?? error?.data?.originalError?.code;
  const message = `${error?.shortMessage || ''} ${error?.details || ''} ${error?.message || ''}`.toLowerCase();
  return code === 4001 || /user rejected|user denied|request rejected|signature request denied/.test(message);
};
