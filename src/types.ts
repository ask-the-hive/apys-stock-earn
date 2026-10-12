export type Balance = { raw: string; amount: string; decimals: number }

export type Pool = {
  id: string
  priceUsd: string | null
  tvlUsd: string | null
  feeRateBps: number | null
  apr24hPercent: string | null
  apr7dPercent: string | null
  apr30dPercent: string | null
  volume24hUsd: string | null
}

export type Stock = {
  mint: string
  symbol: string
  name: string
  balance: Balance
  priceUsd: string | null
  valueUsd: string | null
  boostEligible: boolean
  pool: Pool | null
  warnings: string[]
}

export type BoostPosition = {
  positionNft: string
  poolId: string
  stockMint: string
  stockSymbol: string
  stockName: string
  tickLower: number
  tickUpper: number
  liquidityRaw: string
  tokenFeesOwedStockRaw: string
  tokenFeesOwedUsdcRaw: string
  stockAmount: Balance | null
  usdcAmount: Balance | null
  valueUsd: string | null
  feesOwedUsd: string | null
  range: { lowerPriceUsd: string; upperPriceUsd: string } | null
  pool: Pool | null
  inRange: boolean
}

export type Portfolio = {
  walletAddress: string
  sol: Balance
  usdc: Balance
  stocks: Stock[]
  boosts: BoostPosition[]
  warnings: string[]
  asOf: string
}

export type Session = { walletAddress: string; expiresAt: string }

export type SiwsChallenge = {
  nonce: string
  domain: string
  uri: string
  issuedAt: string
  expirationTime: string
  message: string | null
  signInInput: {
    domain: string
    statement: string
    uri: string
    version: '1'
    chainId: 'mainnet'
    nonce: string
    issuedAt: string
    expirationTime: string
  }
}

export type BoostQuote = {
  quoteToken: string
  requiredStockMax: Balance & { mint: string; symbol: string }
  usdc: Balance
  range: { lowerPrice: string; upperPrice: string; tickLower: number; tickUpper: number }
  pool: Pool
  balancesSufficient: { stock: boolean; usdc: boolean; sol: boolean }
  estimatedSolRequired: string
  expiresAt: string
  disclosures: string[]
}

export type PreparedBoost = {
  transactions: Array<{ encoding: 'base64'; transaction: string; submissionToken: string }>
  blockhash: string
  lastValidBlockHeight: number
  expectedPositionNft: string
  summary: { stockMint: string; stockAmountMaxRaw: string; usdcAmountRaw: string; poolId: string }
}

export type SubmittedBoost = { signature: string; positionNft: string }

export type ApiErrorBody = {
  error: { code: string; message: string; retryable: boolean; requestId: string }
}
