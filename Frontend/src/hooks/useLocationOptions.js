// Shared location option hooks. The organization and investor onboarding flows
// intentionally use the same location master APIs and React Query cache keys.
export {
  useCountryOptions,
  useStateOptions,
  useCityOptions,
} from '@/hooks/useOrganizationOptions';
