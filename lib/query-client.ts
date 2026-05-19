/**
 * TanStack Query client configuration.
 *
 * Default staleTime: 5 min — les données statiques (villes, boardings)
 * ne changent quasiment jamais. Les recherches hôtels utilisent
 * `staleTime: 0` au niveau du hook.
 */

import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
