const TRANSACTION_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

const firstText = (...values) =>
  values
    .map((value) => String(value ?? '').trim())
    .find(Boolean) || '';

export const normalizeTransactionHash = (value) => firstText(value);

export const isValidTransactionHash = (value) =>
  TRANSACTION_HASH_PATTERN.test(normalizeTransactionHash(value));

export const getDeploymentTransactionHash = (record) => {
  const hash = firstText(
    record?.deployTxHash,
    record?.transactionHash,
    record?.deployTx,
    record?.txHash,
    record?.hash,
    record?.contractTxnHash,
    record?.contractTransactionHash,
    record?.transaction?.hash,
    record?.deploymentTransactionHash,
    record?.deployment?.deployTxHash,
    record?.deployment?.transactionHash,
    record?.deployment?.deployTx,
    record?.deployment?.txHash,
    record?.deployment?.contractTxnHash,
    record?.deployment?.contractTransactionHash,
    record?.data?.deployTxHash,
    record?.data?.transactionHash,
    record?.data?.deployTx,
    record?.data?.contractTxnHash,
    record?.result?.deployTxHash,
    record?.result?.transactionHash,
    record?.result?.deployTx,
    record?.result?.contractTxnHash,
  );

  return isValidTransactionHash(hash) ? hash : '';
};

export const assertValidTransactionHash = (value) => {
  const transactionHash = normalizeTransactionHash(value);

  if (!isValidTransactionHash(transactionHash)) {
    const error = new Error('A valid confirmed reference ID is required.');
    error.code = 'INVALID_TRANSACTION_HASH';
    throw error;
  }

  return transactionHash;
};
