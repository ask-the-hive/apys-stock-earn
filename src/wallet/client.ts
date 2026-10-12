import { PublicKey, VersionedTransaction } from '@solana/web3.js'
import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  SolanaMobileWalletAdapterWalletName,
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile'

export const SOLANA_MAINNET = 'solana:mainnet' as const
const STORAGE_KEY = 'apys:last-wallet'
const JUPITER_PATTERN = /^jup(iter)?\b/i
const ALLOWED_WALLETS = new Set([
  'Phantom',
  'Solflare',
  'Backpack',
  SolanaMobileWalletAdapterWalletName,
])

export type SolanaWallet = {
  name: string
  icon: string
  features: { signIn: boolean; signMessage: boolean; signTransaction: boolean }
}

export type ConnectedAccount = {
  wallet: SolanaWallet
  address: string
  publicKey: PublicKey
}

export type SignInInput = {
  domain: string
  address?: string
  statement?: string
  uri?: string
  version?: string
  nonce: string
  issuedAt: string
  expirationTime?: string
  chainId?: string
}

export type SignInResult = {
  account: ConnectedAccount
  signature: Uint8Array
  signedMessage: Uint8Array
}

type Active = { wallet: Wallet; account: WalletAccount; unsubscribe: (() => void) | null }

let mobileWalletRegistered = false

function registerMobileWallet(): void {
  if (mobileWalletRegistered || typeof window === 'undefined' || !/Android/i.test(navigator.userAgent)) return
  mobileWalletRegistered = true
  registerMwa({
    appIdentity: { name: 'APYS', uri: window.location.origin },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [SOLANA_MAINNET],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  })
}

function isSupported(wallet: Wallet): boolean {
  return (ALLOWED_WALLETS.has(wallet.name) || JUPITER_PATTERN.test(wallet.name.trim()))
    && wallet.chains.includes(SOLANA_MAINNET)
    && 'standard:connect' in wallet.features
    && 'solana:signTransaction' in wallet.features
}

function displayName(wallet: Wallet): string {
  return JUPITER_PATTERN.test(wallet.name.trim()) ? 'Jupiter Mobile' : wallet.name
}

function toWallet(wallet: Wallet): SolanaWallet {
  return {
    name: displayName(wallet),
    icon: wallet.icon,
    features: {
      signIn: 'solana:signIn' in wallet.features,
      signMessage: 'solana:signMessage' in wallet.features,
      signTransaction: 'solana:signTransaction' in wallet.features,
    },
  }
}

function toAccount(wallet: Wallet, account: WalletAccount): ConnectedAccount {
  return {
    wallet: toWallet(wallet),
    address: account.address,
    publicKey: new PublicKey(account.address),
  }
}

export function toBytes(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  if (Array.isArray(value)) return Uint8Array.from(value)
  if (typeof value === 'string') {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, byte]) => [Number(key), byte] as const)
      .filter(([key, byte]) => Number.isInteger(key) && key >= 0 && typeof byte === 'number')
    if (entries.length && entries.length === Object.keys(value).length) {
      const bytes = new Uint8Array(entries.length)
      for (const [index, byte] of entries) bytes[index] = byte as number
      return bytes
    }
  }
  throw new Error(`Wallet returned ${label} in an unreadable format.`)
}

export class WalletStandardClient {
  private wallets = new Map<string, Wallet>()
  private active: Active | null = null
  private walletListeners = new Set<() => void>()
  private accountListeners = new Set<() => void>()
  private walletSnapshot: SolanaWallet[] = []
  private accountSnapshot: ConnectedAccount | null = null
  private connects = new Map<string, Promise<ConnectedAccount>>()

  constructor() {
    registerMobileWallet()
    const registry = getWallets()
    for (const wallet of registry.get()) this.add(wallet)
    this.rebuildWalletSnapshot()
    registry.on('register', (...wallets) => {
      for (const wallet of wallets) this.add(wallet)
      this.rebuildWalletSnapshot()
      this.walletListeners.forEach((listener) => listener())
    })
    registry.on('unregister', (...wallets) => {
      for (const wallet of wallets) {
        this.wallets.delete(displayName(wallet))
        if (this.active?.wallet === wallet) this.clearActive()
      }
      this.rebuildWalletSnapshot()
      this.walletListeners.forEach((listener) => listener())
    })
    const lastWallet = localStorage.getItem(STORAGE_KEY)
    if (lastWallet) void this.connect(lastWallet, true).catch(() => undefined)
  }

  list = (): SolanaWallet[] => this.walletSnapshot
  current = (): ConnectedAccount | null => this.accountSnapshot

  subscribeWallets = (listener: () => void): (() => void) => {
    this.walletListeners.add(listener)
    return () => this.walletListeners.delete(listener)
  }

  subscribeAccount = (listener: () => void): (() => void) => {
    this.accountListeners.add(listener)
    return () => this.accountListeners.delete(listener)
  }

  supportsSignIn(name: string): boolean {
    return Boolean(this.wallets.get(name)?.features['solana:signIn'])
  }

  connect(name: string, silent = false): Promise<ConnectedAccount> {
    const key = `${name}:${silent ? 'silent' : 'explicit'}`
    const pending = this.connects.get(key)
    if (pending) return pending
    const attempt = this.runConnect(name, silent).finally(() => this.connects.delete(key))
    this.connects.set(key, attempt)
    return attempt
  }

  private async runConnect(name: string, silent: boolean): Promise<ConnectedAccount> {
    const wallet = this.wallets.get(name)
    if (!wallet) throw new Error(`${name} is not available in this browser.`)
    const feature = wallet.features['standard:connect'] as {
      connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }>
    }
    const result = silent ? await feature.connect({ silent: true }) : await feature.connect()
    const account = result.accounts[0]
    if (!account) throw new Error(`${name} did not return an account.`)
    this.bind(wallet, account)
    localStorage.setItem(STORAGE_KEY, name)
    return toAccount(wallet, account)
  }

  async signIn(name: string, input: SignInInput): Promise<SignInResult> {
    const wallet = this.wallets.get(name)
    if (!wallet) throw new Error(`${name} is not available in this browser.`)
    const feature = wallet.features['solana:signIn'] as {
      signIn(...inputs: SignInInput[]): Promise<readonly {
        account: WalletAccount
        signature: unknown
        signedMessage: unknown
      }[]>
    } | undefined
    if (!feature) throw new Error(`${name} does not support Sign In With Solana.`)
    const [output] = await feature.signIn(input)
    if (!output?.account) throw new Error(`${name} did not return an account.`)
    this.bind(wallet, output.account)
    localStorage.setItem(STORAGE_KEY, name)
    return {
      account: toAccount(wallet, output.account),
      signature: toBytes(output.signature, 'sign-in signature'),
      signedMessage: toBytes(output.signedMessage, 'signed message'),
    }
  }

  async signMessage(message: Uint8Array): Promise<{ signature: Uint8Array; signedMessage: Uint8Array }> {
    const { wallet, account } = this.requireActive()
    const feature = wallet.features['solana:signMessage'] as {
      signMessage(input: { account: WalletAccount; message: Uint8Array }): Promise<readonly {
        signature: unknown
        signedMessage?: unknown
      }[]>
    } | undefined
    if (!feature) throw new Error(`${wallet.name} does not support message signing.`)
    const [output] = await feature.signMessage({ account, message })
    return {
      signature: toBytes(output.signature, 'message signature'),
      signedMessage: output.signedMessage === undefined ? message : toBytes(output.signedMessage, 'signed message'),
    }
  }

  async signAllTransactions(transactions: VersionedTransaction[]): Promise<VersionedTransaction[]> {
    const { wallet, account } = this.requireActive()
    const current = wallet.accounts[0]
    if (!current || current.address !== account.address) {
      if (current) this.bind(wallet, current)
      throw new Error('Your active wallet account changed. Review the new account and try again.')
    }
    const feature = wallet.features['solana:signTransaction'] as {
      signTransaction(...inputs: Array<{
        account: WalletAccount
        transaction: Uint8Array
        chain: typeof SOLANA_MAINNET
      }>): Promise<readonly { signedTransaction: unknown }[]>
    }
    const outputs = await feature.signTransaction(...transactions.map((transaction) => ({
      account,
      transaction: transaction.serialize(),
      chain: SOLANA_MAINNET,
    })))
    return outputs.map((output) => VersionedTransaction.deserialize(toBytes(output.signedTransaction, 'signed transaction')))
  }

  async disconnect(): Promise<void> {
    if (this.active) {
      const feature = this.active.wallet.features['standard:disconnect'] as { disconnect(): Promise<void> } | undefined
      try { await feature?.disconnect() } catch { /* Local state must still be cleared. */ }
    }
    this.clearActive()
    localStorage.removeItem(STORAGE_KEY)
  }

  private add(wallet: Wallet): void {
    if (isSupported(wallet)) this.wallets.set(displayName(wallet), wallet)
  }

  private rebuildWalletSnapshot(): void {
    this.walletSnapshot = [...this.wallets.values()].map(toWallet)
  }

  private bind(wallet: Wallet, account: WalletAccount): void {
    this.active?.unsubscribe?.()
    const events = wallet.features['standard:events'] as {
      on(event: 'change', listener: (properties: { accounts?: readonly WalletAccount[] }) => void): () => void
    } | undefined
    const unsubscribe = events?.on('change', ({ accounts }) => {
      const next = accounts?.[0]
      if (!next) {
        this.clearActive()
        localStorage.removeItem(STORAGE_KEY)
      } else if (next.address !== this.active?.account.address) {
        this.active = { wallet, account: next, unsubscribe: this.active?.unsubscribe ?? null }
        this.accountSnapshot = toAccount(wallet, next)
        this.accountListeners.forEach((listener) => listener())
      }
    }) ?? null
    this.active = { wallet, account, unsubscribe }
    this.accountSnapshot = toAccount(wallet, account)
    this.accountListeners.forEach((listener) => listener())
  }

  private clearActive(): void {
    this.active?.unsubscribe?.()
    this.active = null
    this.accountSnapshot = null
    this.accountListeners.forEach((listener) => listener())
  }

  private requireActive(): { wallet: Wallet; account: WalletAccount } {
    if (!this.active) throw new Error('Connect a wallet first.')
    return this.active
  }
}
