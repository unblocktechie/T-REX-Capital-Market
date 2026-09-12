const DEFAULT_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

const numericStatus = (error) => {
  const candidates = [
    error?.response?.status,
    error?.status,
    error?.statusCode,
    error?.cause?.status,
    error?.cause?.statusCode,
    Number.isFinite(Number(error?.code)) ? Number(error.code) : undefined,
  ];
  const value = candidates.find((candidate) => Number.isFinite(Number(candidate)));
  return value === undefined ? undefined : Number(value);
};

const errorText = (error) =>
  [
    error?.code,
    error?.name,
    error?.message,
    error?.shortMessage,
    error?.details,
    error?.response?.data?.message,
    typeof error?.response?.data?.error === 'string' ? error.response.data.error : null,
    error?.response?.data?.error?.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export const isRateLimitError = (error) => {
  const status = numericStatus(error);
  if (status === 429) return true;

  const text = errorText(error);
  return /rate.?limit|too[_ -]?many[_ -]?requests|throttl|quota exceeded|request limit/.test(text);
};

export const isTransientError = (error) => {
  const status = numericStatus(error);
  if (DEFAULT_RETRYABLE_STATUS_CODES.has(status)) return true;

  const code = String(error?.code || '').toUpperCase();
  if (
    ['ERR_NETWORK', 'ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENETUNREACH'].includes(
      code,
    )
  ) {
    return true;
  }

  const text = errorText(error);
  return /network error|failed to fetch|load failed|temporar(?:y|ily) unavailable|timeout|timed out|connection reset|service unavailable|gateway timeout/.test(
    text,
  );
};

const readHeader = (headers, name) => {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
};

export const getRetryAfterMs = (error) => {
  const raw =
    readHeader(error?.response?.headers, 'retry-after') ??
    error?.retryAfter ??
    error?.retry_after ??
    error?.retryAfterSeconds;

  if (raw === undefined || raw === null || raw === '') return undefined;

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric * 1000;

  const timestamp = Date.parse(String(raw));
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
};

const abortError = (signal) =>
  signal?.reason ||
  (typeof DOMException === 'function'
    ? new DOMException('Request aborted', 'AbortError')
    : Object.assign(new Error('Request aborted'), { name: 'AbortError' }));

export const wait = (delayMs, signal) =>
  new Promise((resolve, reject) => {
    if (!delayMs || delayMs <= 0) {
      resolve();
      return;
    }

    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export const getRetryDelayMs = (
  error,
  attempt,
  { baseDelayMs = 700, maxDelayMs = 8_000, jitter = true } = {},
) => {
  const retryAfterMs = getRetryAfterMs(error);
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const retryDelay = Number.isFinite(retryAfterMs)
    ? Math.min(maxDelayMs, Math.max(retryAfterMs, baseDelayMs))
    : exponential;

  if (!jitter) return Math.round(retryDelay);
  const factor = 0.85 + Math.random() * 0.3;
  return Math.round(Math.min(maxDelayMs, retryDelay * factor));
};

export const retryAsync = async (
  operation,
  {
    maxAttempts = 4,
    baseDelayMs = 700,
    maxDelayMs = 8_000,
    shouldRetry = isTransientError,
    onRetry,
    signal,
  } = {},
) => {
  let attempt = 1;

  while (attempt <= maxAttempts) {
    if (signal?.aborted) throw abortError(signal);

    try {
      return await operation({ attempt, maxAttempts });
    } catch (error) {
      const retryable = attempt < maxAttempts && shouldRetry(error, attempt);
      if (!retryable) {
        if (attempt > 1) error.__retryExhausted = true;
        error.__retryAttempts = attempt;
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt, { baseDelayMs, maxDelayMs });
      onRetry?.({ error, attempt, nextAttempt: attempt + 1, maxAttempts, delayMs });
      await wait(delayMs, signal);
      attempt += 1;
    }
  }

  throw new Error('Retry operation ended unexpectedly.');
};
