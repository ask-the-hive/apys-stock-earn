import type { ApiErrorBody, BoostQuote, Portfolio, PreparedBoost, Session, SiwsChallenge, SubmittedBoost } from './types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null
    throw new ApiError(
      body?.error.message ?? `Request failed (${response.status})`,
      response.status,
      body?.error.code ?? 'HTTP_ERROR',
      body?.error.requestId,
      body?.error.retryable,
    )
  }
  return response.json() as Promise<T>
}

export const api = {
  session: () => request<Session>('/v1/auth/session'),
  challenge: (walletAddress?: string) => request<SiwsChallenge>('/v1/auth/siws/challenge', {
    method: 'POST',
    body: JSON.stringify(walletAddress ? { walletAddress } : {}),
  }),
  verify: (input: { walletAddress: string; signature: string; message: string }) =>
    request<Session>('/v1/auth/siws/verify', { method: 'POST', body: JSON.stringify(input) }),
  signOut: () => request<{ ok: true }>('/v1/auth/session', { method: 'DELETE' }),
  portfolio: () => request<Portfolio>('/v1/portfolio'),
  quote: (input: { stockMint: string; usdcAmount: string; slippageBps: number }) =>
    request<BoostQuote>('/v1/boosts/quote', { method: 'POST', body: JSON.stringify(input) }),
  prepare: (quoteToken: string) => request<PreparedBoost>('/v1/boosts/prepare', {
    method: 'POST',
    body: JSON.stringify({ quoteToken }),
  }),
  submit: (transaction: string, submissionToken: string) => request<SubmittedBoost>('/v1/boosts/submit', {
    method: 'POST',
    body: JSON.stringify({ transaction, submissionToken }),
  }),
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
