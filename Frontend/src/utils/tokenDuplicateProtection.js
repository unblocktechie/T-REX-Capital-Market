const stringifyErrorPart = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(stringifyErrorPart).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .flatMap(([key, nestedValue]) => [key, stringifyErrorPart(nestedValue)])
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

export const getTokenErrorSearchText = (error) =>
  [
    error?.code,
    error?.name,
    error?.shortMessage,
    error?.details,
    error?.message,
    error?.cause,
    error?.response?.statusText,
    error?.response?.data,
  ]
    .map(stringifyErrorPart)
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

const DUPLICATE_TOKEN_PATTERNS = [
  /duplicate(?:\s+entry|\s+key|\s+token)?/i,
  /already\s+(?:been\s+)?(?:exists?|created|registered|deployed|used|taken)/i,
  /token\s+(?:name|symbol|details|record|suite)?.*\bexists?\b/i,
  /(?:name|symbol).*\b(?:exists?|taken|used|duplicate|unique|conflict)\b/i,
  /(?:must\s+be|should\s+be)\s+unique/i,
  /token.*\bconflict\b/i,
  /unique\s+(?:constraint|violation|index)/i,
  /violates\s+unique/i,
  /er_dup_entry/i,
  /sequelizeuniqueconstrainterror/i,
  /\bp2002\b/i,
  /\b23505\b/i,
  /create2/i,
  /salt.*(?:used|exists|deployed|duplicate)/i,
];

export const isDuplicateTokenError = (error) => {
  if (error?.code === 'TOKEN_ALREADY_DEPLOYED' || error?.code === 'TOKEN_DUPLICATE') {
    return true;
  }

  const text = getTokenErrorSearchText(error);
  return DUPLICATE_TOKEN_PATTERNS.some((pattern) => pattern.test(text));
};

export const hasConfirmedDeploymentEvidence = (token) => {
  const deployment = token?.deployment || {};
  const contracts = token?.contracts || deployment?.contracts || {};
  const status = String(token?.status || deployment?.status || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

  return Boolean(
    status === 'deployed' ||
      token?.deployedAt ||
      token?.deployTx ||
      token?.transactionHash ||
      deployment?.deployedAt ||
      deployment?.deployTx ||
      deployment?.transactionHash ||
      token?.tokenAddress ||
      contracts?.token,
  );
};

export const createAlreadyDeployedError = () => {
  const error = new Error(
    'This token already has a confirmed deployment record. A second blockchain transaction was blocked.',
  );
  error.code = 'TOKEN_ALREADY_DEPLOYED';
  return error;
};

export const getDuplicateTokenMessage = ({ tokenName = '', tokenSymbol = '' } = {}) => {
  const name = String(tokenName || '').trim();
  const symbol = String(tokenSymbol || '').trim().toUpperCase();
  const identity = [name && `“${name}”`, symbol && `(${symbol})`].filter(Boolean).join(' ');

  return identity
    ? `A token using ${identity} already exists. Return to Token Information and enter a unique token name and symbol. No duplicate blockchain transaction was sent.`
    : 'A token with the same name or symbol already exists. Return to Token Information and use unique details. No duplicate blockchain transaction was sent.';
};

export const getDuplicateTokenFieldErrors = (error, { assumeDuplicate = false } = {}) => {
  if (!assumeDuplicate && !isDuplicateTokenError(error)) return {};

  const text = getTokenErrorSearchText(error);
  const mentionsName = /token\s*name|\bname\b/.test(text);
  const mentionsSymbol = /token\s*symbol|\bsymbol\b|ticker/.test(text);
  const genericConflict = !mentionsName && !mentionsSymbol;
  const result = {};

  if (mentionsName || genericConflict) result.name = 'This token name is already in use.';
  if (mentionsSymbol || genericConflict) result.symbol = 'This token symbol is already in use.';

  return result;
};
