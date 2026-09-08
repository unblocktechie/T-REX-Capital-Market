import { getApiFieldErrors, getErrorMessage } from '@/utils/error';

export const mapTokenApiFieldErrors = (error, fieldMap = {}) => {
  const mapped = {};
  getApiFieldErrors(error).forEach(({ field, message }) => {
    const normalized = String(field || '')
      .replace(/^data\./, '')
      .replace(/^body\./, '')
      .replace(/^payload\./, '');
    const target = fieldMap[normalized] || fieldMap[field] || normalized;
    if (target && message && !mapped[target]) mapped[target] = message;
  });
  return mapped;
};

export const getTokenApiErrorMessage = (error, fallback) => {
  const requestId = error?.response?.headers?.['x-request-id'];
  const message = getErrorMessage(error, fallback);
  return requestId ? `${message} Reference: ${requestId}` : message;
};
