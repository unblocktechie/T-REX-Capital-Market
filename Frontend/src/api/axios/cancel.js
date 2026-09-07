export const createRequestController = () => {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel: (reason = 'Request cancelled') => controller.abort(reason),
  };
};
