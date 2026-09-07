import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/error';

const shouldNotify = (meta, error) =>
  meta?.silent !== true && error?.__skipGlobalErrorToast !== true;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (shouldNotify(query.meta, error)) toast.error(getErrorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (shouldNotify(mutation.meta, error)) toast.error(getErrorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        return status && status < 500 ? false : failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
