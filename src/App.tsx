import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { VersionedTransaction } from '@solana/web3.js'
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  ExternalLink,
  LoaderCircle,
  PieChart,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
  Zap,
} from 'lucide-react'
import { api, errorMessage } from './api'
import { queryKeys } from './query'
import type { BoostQuote, Portfolio, Stock } from './types'
import { useWallet } from './wallet/provider'

const EXPLORER = 'https://solscan.io'

const STOCK_LOGOS: Record<string, string> = {
  Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh: 'https://xstocks-metadata.backed.fi/logos/tokens/NVDAx.png',
  XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp: 'https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png',
  SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb: 'https://logopng.com.br/logos/spacex-159.png',
  MSTRdWXMeZxdE8osAQy3fA4rvTY5rgummDSMEx6U7Nz: 'https://backpack.exchange/api/stock-logo/MSTR',
}

const SOL_LOGO = 'https://assets.coingecko.com/coins/images/4128/small/solana.png'
const USDC_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'

function money(value: string | null, maximumFractionDigits = 2): string {
  if (value === null) return '—'
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(number)
}

function compactMoney(value: string | null): string {
  if (value === null) return '—'
  const number = Number(value)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(number)
    : '—'
}

function feeTier(bps: number | null): string {
  if (bps === null) return '—'
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(bps / 100)}%`
}

function percent(value: string | null): string {
  if (value === null) return '—'
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(number >= 10 ? 1 : 2)}%` : '—'
}

function tokenAmount(value: string, maximumFractionDigits = 4): string {
  const number = Number(value)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(number)
    : value
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function AppLogo() {
  return (
    <div className="brand" aria-label="apys">
      <img src="/apys-mark.svg" alt="" />
      <span>apys</span>
    </div>
  )
}

const APYS_URL = 'https://apys.co'

function PrimaryNavigation() {
  return (
    <>
      <header className="topbar">
        <nav className="nav-layout" aria-label="Primary navigation">
          <div className="nav-pod nav-secondary">
            <a href={`${APYS_URL}/docs`}>Learn more</a>
            <a href={`${APYS_URL}/blog`}>Blog</a>
          </div>

          <a className="nav-brand" href={APYS_URL} aria-label="APYS home">
            <AppLogo />
          </a>

          <div className="nav-actions">
            <div className="nav-pod nav-product-links">
              <a href={`${APYS_URL}/portfolio`}>Portfolio</a>
              <span aria-current="page">Pools</span>
            </div>
          </div>
        </nav>
      </header>

      <nav className="mobile-tabbar" aria-label="Primary navigation">
        <a href={`${APYS_URL}/portfolio`}><PieChart /><span>Portfolio</span></a>
        <a className="mobile-nav-brand" href={APYS_URL} aria-label="APYS home"><img src="/apys-mark.svg" alt="" /></a>
      </nav>
    </>
  )
}

function AssetIcon({ src, alt, fallback, className = '' }: { src: string; alt: string; fallback: string; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) return <span className="stock-icon-fallback">{fallback}</span>

  return <img className={`stock-icon ${className}`} src={src} alt={alt} onError={() => setFailed(true)} />
}

function StockIcon({ stock }: { stock: Stock }) {
  return <StockAssetIcon mint={stock.mint} name={stock.name} symbol={stock.symbol} />
}

function StockAssetIcon({ mint, name, symbol }: { mint: string; name: string; symbol: string }) {
  const src = STOCK_LOGOS[mint] ?? `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png?size=md`

  return <AssetIcon src={src} alt={`${name} logo`} fallback={symbol.slice(0, 1)} className={`stock-icon-${symbol.toLowerCase()}`} />
}

export function App() {
  const wallet = useWallet()
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (wallet.account) setPickerOpen(false)
  }, [wallet.account])

  return (
    <div className="app-shell">
      <PrimaryNavigation />

      {wallet.account ? (
        <Dashboard />
      ) : (
        <SignedOutDashboard onConnect={() => setPickerOpen(true)} reconnect={Boolean(wallet.rawAccount)} />
      )}

      <footer className="footer">
        <AppLogo />
        <p>Noncustodial by design. You approve every transaction.</p>
        <a href="https://solana.com" target="_blank" rel="noreferrer">Built on Solana <ExternalLink size={12} /></a>
      </footer>

      {pickerOpen && <WalletPicker onClose={() => setPickerOpen(false)} />}
    </div>
  )
}

function SignedOutDashboard({ onConnect, reconnect }: { onConnect: () => void; reconnect: boolean }) {
  return (
    <main className="dashboard signed-out-dashboard">
      <section className="panel composer-panel stocks-panel signed-out-panel">
        <div className="panel-heading">
          <div><h2>Your portfolio</h2></div>
          <span className="signed-out-badge">Not connected</span>
        </div>
        <div className="boost-stock-list signed-out-assets" aria-hidden="true">
          <div className="boost-stock-row portfolio-asset-row">
            <AssetIcon src={SOL_LOGO} alt="" fallback="S" />
            <div className="stock-identity"><strong>SOL</strong><small>Solana</small></div>
            <div className="stock-balance asset-balance-wide"><small>Balance</small><strong>—</strong></div>
          </div>
          <div className="boost-stock-row portfolio-asset-row">
            <AssetIcon src={USDC_LOGO} alt="" fallback="$" />
            <div className="stock-identity"><strong>USDC</strong><small>USD Coin</small></div>
            <div className="stock-balance asset-balance-wide"><small>Balance</small><strong>—</strong></div>
          </div>
        </div>
        <div className="connection-gate">
          <div className="composer-orb"><WalletCards size={22} /></div>
          <h3>Connect to view your stocks.</h3>
          <p>Your supported holdings, available USDC, and fee-earning positions will appear here.</p>
          <button className="button button-dark" type="button" onClick={onConnect}>
            <WalletCards size={17} /> {reconnect ? 'Reconnect wallet' : 'Connect wallet'}
          </button>
          <span className="custody-note"><ShieldCheck size={14} /> Noncustodial. You approve every transaction.</span>
        </div>
      </section>

      <section className="panel positions-panel signed-out-positions">
        <div className="panel-heading">
          <div><h2>Your positions</h2></div>
          <span className="stock-count">—</span>
        </div>
        <div className="empty-positions"><span>No wallet connected</span><small>Connect your wallet to load your LP positions.</small></div>
      </section>
    </main>
  )
}

function WalletPicker({ onClose }: { onClose: () => void }) {
  const wallet = useWallet()
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="modal-symbol"><WalletCards /></div>
        <h2 id="wallet-title">Connect your wallet</h2>
        <p>Choose a Solana wallet. You’ll sign a free message to prove ownership—no transaction, no funds moved.</p>
        <div className="wallet-list">
          {wallet.wallets.length ? wallet.wallets.map((option) => (
            <button
              className="wallet-option"
              type="button"
              key={option.name}
              disabled={wallet.busyWallet !== null}
              onClick={() => void wallet.connect(option.name).catch(() => undefined)}
            >
              <img src={option.icon} alt="" />
              <span><strong>{option.name}</strong><small>{option.features.signIn ? 'One-step secure sign-in' : 'Connect + message signature'}</small></span>
              {wallet.busyWallet === option.name ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}
            </button>
          )) : (
            <div className="wallet-empty">
              <strong>No supported wallet detected</strong>
              <span>Install Phantom, Solflare, or Backpack, then refresh this page.</span>
            </div>
          )}
        </div>
        {wallet.error && <div className="inline-error">{wallet.error}</div>}
        <div className="modal-security"><ShieldCheck size={15} /> SIWS creates a 7-day HttpOnly session.</div>
      </section>
    </div>
  )
}

function Dashboard() {
  const wallet = useWallet()
  const portfolio = useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: api.portfolio,
    enabled: Boolean(wallet.account),
  })

  return (
    <main className="dashboard">
      {portfolio.isPending ? <PortfolioSkeleton /> : portfolio.isError ? (
        <ErrorState message={errorMessage(portfolio.error)} retry={() => void portfolio.refetch()} />
      ) : (
        <PortfolioDashboard portfolio={portfolio.data} onRefresh={() => void portfolio.refetch()} refreshing={portfolio.isFetching} />
      )}
    </main>
  )
}

function PortfolioDashboard({ portfolio, onRefresh, refreshing }: { portfolio: Portfolio; onRefresh: () => void; refreshing: boolean }) {
  const eligible = portfolio.stocks.filter((stock) => stock.boostEligible && stock.pool)

  return (
    <>
      {portfolio.warnings.length > 0 && <div className="warning-banner">{portfolio.warnings.join(' ')}</div>}
      <div className="utility-workspace">
        <BoostComposer
          stocks={eligible}
          usdcAvailable={portfolio.usdc.amount}
          solAvailable={portfolio.sol.amount}
          asOf={portfolio.asOf}
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      </div>

      <section className="panel positions-panel">
        <div className="panel-heading">
          <div><h2>Your positions</h2></div>
          <span className="stock-count">{portfolio.boosts.length}</span>
        </div>
        {portfolio.boosts.length ? <div className="position-grid">
          {portfolio.boosts.map((position) => (
            <a key={position.positionNft} href={`${EXPLORER}/token/${position.positionNft}`} target="_blank" rel="noreferrer" className="position-card">
              <div className="position-header">
                <StockAssetIcon mint={position.stockMint} name={position.stockName} symbol={position.stockSymbol} />
                <span className="position-identity">
                  <strong>{position.stockSymbol} / USDC</strong>
                  <small>{position.stockName} liquidity</small>
                </span>
                <span className={`position-status ${position.inRange ? 'active' : ''}`}><i />{position.inRange ? 'In range' : 'Out of range'}</span>
                <ExternalLink size={14} />
              </div>
              <div className="position-metrics">
                <span><small>Position value</small><strong>{money(position.valueUsd)}</strong></span>
                <span><small>24h APR</small><strong className="green">{percent(position.pool?.apr24hPercent ?? null)}</strong></span>
                <span><small>Fee tier</small><strong>{feeTier(position.pool?.feeRateBps ?? null)}</strong></span>
                <span><small>Pool price</small><strong>{money(position.pool?.priceUsd ?? null, 4)}</strong></span>
              </div>
              <div className="position-details">
                <span><small>Assets</small><strong>{position.stockAmount && position.usdcAmount ? `${tokenAmount(position.stockAmount.amount)} ${position.stockSymbol} + ${tokenAmount(position.usdcAmount.amount, 2)} USDC` : '—'}</strong></span>
                <span><small>Price range</small><strong>{position.range ? `${money(position.range.lowerPriceUsd, 2)} – ${money(position.range.upperPriceUsd, 2)}` : '—'}</strong></span>
                <span><small>Unclaimed fees</small><strong>{money(position.feesOwedUsd)}</strong></span>
                <span><small>7d / 30d APR</small><strong>{percent(position.pool?.apr7dPercent ?? null)} / {percent(position.pool?.apr30dPercent ?? null)}</strong></span>
                <span><small>Pool TVL</small><strong>{compactMoney(position.pool?.tvlUsd ?? null)}</strong></span>
                <span><small>24h volume</small><strong>{compactMoney(position.pool?.volume24hUsd ?? null)}</strong></span>
              </div>
            </a>
          ))}
        </div> : <div className="empty-positions"><span>No fee-earning positions yet</span><small>Choose Earn fees above to create your first LP.</small></div>}
      </section>
    </>
  )
}

function BoostComposer({ stocks, usdcAvailable, solAvailable, asOf, onRefresh, refreshing }: { stocks: Stock[]; usdcAvailable: string; solAvailable: string; asOf: string; onRefresh: () => void; refreshing: boolean }) {
  const wallet = useWallet()
  const queryClient = useQueryClient()
  const [stockMint, setStockMint] = useState('')
  const [amount, setAmount] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [success, setSuccess] = useState<{ signatures: string[]; positionNft: string } | null>(null)
  const selected = stocks.find((stock) => stock.mint === stockMint)
  const quote = useMutation({ mutationFn: api.quote })
  const execute = useMutation({
    mutationFn: async (currentQuote: BoostQuote) => {
      const prepared = await api.prepare(currentQuote.quoteToken)
      const transactions = prepared.transactions.map(({ transaction }) =>
        VersionedTransaction.deserialize(Uint8Array.from(atob(transaction), (char) => char.charCodeAt(0))))
      const signed = await wallet.signAllTransactions(transactions)
      const submitted = []
      for (const [index, transaction] of signed.entries()) {
        const authorization = prepared.transactions[index]
        if (!authorization) throw new Error('The API returned an invalid transaction submission authorization.')
        submitted.push(await api.submit(bytesToBase64(transaction.serialize()), authorization.submissionToken))
      }
      return { signatures: submitted.map(({ signature }) => signature), positionNft: prepared.expectedPositionNft }
    },
    onSuccess: async (result) => {
      setSuccess(result)
      quote.reset()
      setAmount('')
      await queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
    },
  })

  useEffect(() => {
    if (stockMint && !stocks.some((stock) => stock.mint === stockMint)) setStockMint('')
  }, [stocks, stockMint])

  const resetQuote = () => {
    quote.reset()
    execute.reset()
    setSuccess(null)
  }

  if (success) {
    return (
      <section className="panel composer-panel success-panel">
        <div className="success-mark"><Check /></div>
        <h2>Your LP is earning.</h2>
        <p>Your stock and USDC are now paired in a concentrated-liquidity position on Raydium.</p>
        <a className="button button-dark" href={`${EXPLORER}/tx/${success.signatures[0]}`} target="_blank" rel="noreferrer">View transaction <ExternalLink size={15} /></a>
        <button className="text-button" type="button" onClick={() => { setSuccess(null); setStockMint('') }}>Back to stocks</button>
      </section>
    )
  }

  return (
    <section className="panel composer-panel stocks-panel">
      <div className="panel-heading">
        <div><h2>Your portfolio</h2></div>
        <div className="stock-panel-meta">
          <span className="as-of">Updated {new Date(asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <button className="refresh-button" type="button" aria-label="Refresh portfolio" onClick={onRefresh} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button>
        </div>
      </div>
      <div className="boost-stock-list">
        <div className="boost-stock-row portfolio-asset-row">
          <AssetIcon src={SOL_LOGO} alt="Solana logo" fallback="S" />
          <div className="stock-identity"><strong>SOL</strong><small>Solana</small></div>
          <div className="stock-balance asset-balance-wide"><small>Balance</small><strong>{tokenAmount(solAvailable)} SOL</strong></div>
        </div>
        <div className="boost-stock-row portfolio-asset-row">
          <AssetIcon src={USDC_LOGO} alt="USD Coin logo" fallback="$" />
          <div className="stock-identity"><strong>USDC</strong><small>USD Coin</small></div>
          <div className="stock-balance asset-balance-wide"><small>Balance</small><strong>{tokenAmount(usdcAvailable, 2)} USDC</strong></div>
        </div>
        {!stocks.length && <EmptyHoldings />}
        {stocks.map((stock) => {
          const active = selected?.mint === stock.mint
          return <div className={`boost-stock-item ${active ? 'active' : ''}`} key={stock.mint}>
            <div className="boost-stock-row">
              <StockIcon stock={stock} />
              <div className="stock-identity"><strong>{stock.symbol}</strong><small>{stock.name}</small></div>
              <button className={`boost-button ${active ? 'active' : ''}`} type="button" aria-expanded={active} onClick={() => {
                setStockMint(active ? '' : stock.mint)
                setAmount('')
                setAdvancedOpen(false)
                resetQuote()
              }}>{active ? 'Close' : 'Earn fees'}</button>
              <div className="stock-balance"><small>Balance</small><strong>{tokenAmount(stock.balance.amount, 6)}</strong></div>
            </div>
            {active && selected && <div className="inline-boost-form">
              <div className="field-row">
                <label className="field-label" htmlFor={`amount-${stock.mint}`}>USDC amount</label>
                <button className="max-button" type="button" onClick={() => { setAmount(usdcAvailable); resetQuote() }}>MAX {money(usdcAvailable)}</button>
              </div>
              <div className="amount-input">
                <input id={`amount-${stock.mint}`} inputMode="decimal" placeholder="0.00" autoFocus value={amount} onChange={(event) => { setAmount(event.target.value); resetQuote() }} />
                <span>USDC</span>
              </div>
              <button className="advanced-toggle" type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)}>
                Advanced details <ChevronDown className={advancedOpen ? 'open' : ''} size={15} />
              </button>
              {advancedOpen && <div className="advanced-details">
                <div className="composer-details">
                  <div><span>Pool price</span><strong>{money(selected.pool?.priceUsd ?? null, 4)}</strong></div>
                  <div><span>Current APR</span><strong className="green">{percent(selected.pool?.apr24hPercent ?? null)}</strong></div>
                  <div><span>Position range</span><strong>±10%</strong></div>
                </div>
                <div className="slippage-row">
                  <span>Max slippage</span>
                  {[30, 50, 100].map((bps) => <button className={slippageBps === bps ? 'active' : ''} type="button" key={bps} onClick={() => { setSlippageBps(bps); resetQuote() }}>{bps / 100}%</button>)}
                </div>
                {quote.data && <div className="advanced-quote-meta">
                  <span>Range {money(quote.data.range.lowerPrice, 4)}–{money(quote.data.range.upperPrice, 4)}</span>
                  <span>Expires {new Date(quote.data.expiresAt).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}</span>
                </div>}
              </div>}
              {quote.data ? (
                <QuoteReview quote={quote.data} pending={execute.isPending} error={execute.error} onConfirm={() => execute.mutate(quote.data)} onCancel={resetQuote} />
              ) : (
                <>
                  {(quote.error || execute.error) && <div className="inline-error">{errorMessage(quote.error ?? execute.error)}</div>}
                  <button className="button button-dark button-wide" type="button" disabled={quote.isPending || !/^\d+(?:\.\d+)?$/.test(amount) || Number(amount) <= 0} onClick={() => quote.mutate({ stockMint: selected.mint, usdcAmount: amount, slippageBps })}>
                    {quote.isPending ? <><LoaderCircle className="spin" size={17} /> Calculating match</> : <>Review fee earnings <ArrowRight size={17} /></>}
                  </button>
                </>
              )}
            </div>}
          </div>
        })}
      </div>
    </section>
  )
}

function QuoteReview({ quote, pending, error, onConfirm, onCancel }: { quote: BoostQuote; pending: boolean; error: unknown; onConfirm: () => void; onCancel: () => void }) {
  const sufficient = Object.values(quote.balancesSufficient).every(Boolean)
  return (
    <div className="quote-review">
      <div className="quote-title"><span>Fee earnings summary</span></div>
      <div className="quote-pair">
        <div><small>You add</small><strong>{money(quote.usdc.amount, 4)} USDC</strong></div>
        <ArrowRight size={15} />
        <div><small>Stock paired, max</small><strong>{tokenAmount(quote.requiredStockMax.amount, 6)} {quote.requiredStockMax.symbol}</strong></div>
      </div>
      {!sufficient && <div className="inline-error">This wallet needs more {!quote.balancesSufficient.usdc ? 'USDC' : !quote.balancesSufficient.sol ? 'SOL for fees' : quote.requiredStockMax.symbol} before it can create this LP.</div>}
      {Boolean(error) && <div className="inline-error">{errorMessage(error)}</div>}
      <button className="button button-dark button-wide" type="button" disabled={!sufficient || pending} onClick={onConfirm}>
        {pending ? <><LoaderCircle className="spin" size={17} /> Preparing & signing</> : <><Zap size={17} /> Sign and create LP</>}
      </button>
      <button className="text-button" type="button" disabled={pending} onClick={onCancel}>Edit amount</button>
    </div>
  )
}

function EmptyHoldings() {
  return (
    <div className="empty-holdings">
      <CircleDollarSign />
      <h3>No supported stocks found</h3>
      <p>This wallet does not currently hold a registered tokenized stock.</p>
    </div>
  )
}

function PortfolioSkeleton() {
  return <div className="skeleton-layout"><div /><div /><div /><div /><section /><aside /></div>
}

function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  return (
    <section className="error-state">
      <div>!</div><h2>Portfolio unavailable</h2><p>{message}</p>
      <button className="button button-dark" type="button" onClick={retry}><RefreshCw size={15} /> Try again</button>
    </section>
  )
}
