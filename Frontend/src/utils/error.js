const firstValidationMessage = (errors) => {
  if (!errors) return null;
  if (Array.isArray(errors)) {
    const first = errors[0];
    return typeof first === 'string' ? first : first?.message;
  }
  if (typeof errors === 'object') {
    const first = Object.values(errors).flat()[0];
    return typeof first === 'string' ? first : first?.message;
  }
  return null;
};

export const sanitizeUserFacingMessage = (message) => {
  if (typeof message !== 'string') return message;

  return message
    .replace(/\bBackend\s+API\b/g, 'Service')
    .replace(/\bbackend\s+API\b/gi, 'service')
    .replace(/\bBackend\s+server\b/g, 'Service')
    .replace(/\bbackend\s+server\b/gi, 'service')
    .replace(/\bBackend\b/g, 'Service')
    .replace(/\bbackend\b/gi, 'service')
    .replace(/\btransaction hash\b/gi, 'transaction ID')
    .replace(/\bclaim topics?\b/gi, (match) => match.toLowerCase().endsWith('s') ? 'verification requirements' : 'verification requirement')
    .replace(/\bidentity registry\b/gi, 'approved investor registry')
    .replace(/\badd(?:ed|ing)? to (?:the )?registry\b/gi, 'approve investor')
    .replace(/\bONCHAINID\b/g, 'on-chain identity')
    .replace(/\bdeployment transaction\b/gi, 'token-creation transaction')
    .replace(/\bdeployment\b/gi, 'token creation')
    .replace(/\bgas fee\b/gi, 'network fee');
};

export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  if (!error?.response && error?.code === 'ERR_NETWORK') {
    return "We're experiencing a temporary issue. Please try again in a few moments.";
  }

  const payload = error?.response?.data;
  return sanitizeUserFacingMessage(
    payload?.message ||
      (typeof payload?.error === 'string' ? payload.error : payload?.error?.message) ||
      firstValidationMessage(payload?.errors) ||
      error?.message ||
      fallback,
  );
};

export const getApiFieldErrors = (error) => {
  const payload = error?.response?.data;
  const details = payload?.error?.details ?? payload?.errors;
  const normalizedDetails = Array.isArray(details)
    ? details
    : details && typeof details === 'object'
      ? Object.entries(details).flatMap(([field, messages]) =>
          (Array.isArray(messages) ? messages : [messages]).map((message) => ({
            field,
            message: typeof message === 'string' ? message : message?.message,
          })),
        )
      : [];

  return normalizedDetails
    .map((item) => ({
      field: String(item?.field || '')
        .replace(/^body\./, '')
        .replace(/\[(\d+)\]/g, '.$1'),
      message: sanitizeUserFacingMessage(item?.message || item?.msg || ''),
    }))
    .filter((item) => item.field && item.message);
};

export const applyApiFieldErrors = (error, setError, fieldMap = {}) => {
  const fieldErrors = getApiFieldErrors(error);
  fieldErrors.forEach(({ field, message }) => {
    const normalizedField = field
      .replace(/^owners\.(\d+)\./, 'beneficialOwners.$1.')
      .replace(/^beneficialOwners\.(\d+)\.nationalityCountryUid$/, 'beneficialOwners.$1.nationality');
    const target = fieldMap[normalizedField] || fieldMap[field] || normalizedField;
    setError(target, { type: 'server', message });
  });
  return fieldErrors.length > 0;
};
