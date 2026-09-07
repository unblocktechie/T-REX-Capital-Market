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

export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  if (!error?.response && error?.code === 'ERR_NETWORK') {
    return 'Cannot reach the T-REX backend. Check the API server, network, and CORS settings.';
  }

  const payload = error?.response?.data;
  return (
    payload?.message ||
    (typeof payload?.error === 'string' ? payload.error : payload?.error?.message) ||
    firstValidationMessage(payload?.errors) ||
    error?.message ||
    fallback
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
      message: item?.message || item?.msg || '',
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
