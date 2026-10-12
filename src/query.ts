import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => {
        const status = typeof error === 'object' && error && 'status' in error
          ? Number((error as { status: unknown }).status)
          : 0
        return status >= 500 && count < 2
      },
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})

export const queryKeys = {
  session: ['session'] as const,
  portfolio: ['portfolio'] as const,
}
