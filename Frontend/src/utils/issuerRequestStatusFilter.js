import { isApplicationCompleted, readApplicationProgress } from './applicationProgress.js';

// "Completed" is a journey display state, not a status supported by the
// existing investment-interest API filter. Fetch All Requests and filter using
// the same backend progress rules that drive the journey badge and CTA.
export const issuerRequestApiStatus = (filter) => filter === 'completed' ? 'all' : filter;

export const filterIssuerRequestsByStatus = (requests, filter) => {
  if (filter !== 'completed') return requests;
  return requests.filter((request) =>
    isApplicationCompleted(readApplicationProgress(request), request.status));
};
