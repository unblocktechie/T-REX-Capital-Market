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
