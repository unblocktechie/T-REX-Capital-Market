import { useQuery } from '@tanstack/react-query';
import {
  mapOrganizationOptions,
  organizationApi,
  toSelectOptions,
} from '@/api/organization';

const mergeFallbackOptions = (options, fallbackOptions = []) => {
  const merged = [...(Array.isArray(options) ? options : [])];
  const knownValues = new Set(merged.map((option) => String(option.value)));

  (Array.isArray(fallbackOptions) ? fallbackOptions : [])
    .filter((option) => option?.value && option?.label)
    .forEach((option) => {
      if (!knownValues.has(String(option.value))) {
        merged.unshift({ value: option.value, label: option.label });
        knownValues.add(String(option.value));
      }
    });

  return merged;
};

export function useOrganizationOptions() {
  const query = useQuery({
    queryKey: ['organization', 'options'],
    queryFn: async () => mapOrganizationOptions(await organizationApi.getOptions()),
    staleTime: 30 * 60_000,
  });

  const data = query.data || { entityTypes: [], industries: [], documentTypes: [] };
  return {
    ...query,
    data,
    entityTypeOptions: toSelectOptions(data.entityTypes, 'entityTypeUid', 'entityTypeName'),
    industryOptions: toSelectOptions(data.industries, 'industryUid', 'industryName'),
    documentTypeOptions: toSelectOptions(
      data.documentTypes,
      'documentTypeUid',
      'documentTypeName',
    ),
    requiredDocumentTypeUids: data.documentTypes
      .filter((item) => Boolean(item.isRequired))
      .map((item) => item.documentTypeUid),
  };
}

export function useCountryOptions(fallbackOptions = []) {
  const query = useQuery({
    queryKey: ['locations', 'countries'],
    queryFn: organizationApi.getAllCountries,
    staleTime: 60 * 60_000,
  });
  return {
    ...query,
    options: mergeFallbackOptions(
      toSelectOptions(query.data, 'countryUid', 'countryName'),
      fallbackOptions,
    ),
  };
}

export function useStateOptions(countryUid, fallbackOptions = []) {
  const query = useQuery({
    queryKey: ['locations', 'states', countryUid],
    queryFn: () => organizationApi.getAllStates(countryUid),
    enabled: Boolean(countryUid),
    staleTime: 30 * 60_000,
  });
  return {
    ...query,
    options: mergeFallbackOptions(
      toSelectOptions(query.data, 'stateUid', 'stateName'),
      fallbackOptions,
    ),
  };
}

export function useCityOptions(stateUid, fallbackOptions = []) {
  const query = useQuery({
    queryKey: ['locations', 'cities', stateUid],
    queryFn: () => organizationApi.getAllCities(stateUid),
    enabled: Boolean(stateUid),
    staleTime: 30 * 60_000,
  });
  return {
    ...query,
    options: mergeFallbackOptions(
      toSelectOptions(query.data, 'cityUid', 'cityName'),
      fallbackOptions,
    ),
  };
}
