import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { VersionedTransaction } from '@solana/web3.js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '../api'
import { queryKeys } from '../query'
import type { Session } from '../types'
import { WalletStandardClient, type ConnectedAccount, type SolanaWallet } from './client'

type WalletContextValue = {
  wallets: SolanaWallet[]
  account: ConnectedAccount | null
  rawAccount: ConnectedAccount | null
  session: Session | null
  busyWallet: string | null
  error: string | null
  connect(name: string): Promise<void>
  disconnect(): Promise<void>
  signAllTransactions(transactions: VersionedTransaction[]): Promise<VersionedTransaction[]>
}

const EMPTY_WALLETS: SolanaWallet[] = []
const WalletContext = createContext<WalletContextValue | null>(null)

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<WalletStandardClient | null>(null)
  if (!clientRef.current) {
    clientRef.current = new WalletStandardClient()
  }
  const client = clientRef.current
  const queryClient = useQueryClient()
  const [busyWallet, setBusyWallet] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const wallets = useSyncExternalStore(client.subscribeWallets, client.list, () => EMPTY_WALLETS)
  const rawAccount = useSyncExternalStore(client.subscribeAccount, client.current, () => null)
  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: api.session,
    retry: false,
  })
  const session = sessionQuery.data ?? null
  const account = rawAccount && session?.walletAddress === rawAccount.address ? rawAccount : null

  const connect = useCallback(async (name: string) => {
    setBusyWallet(name)
    setError(null)
    try {
      let walletAddress: string
      let signature: Uint8Array
      let message: string
      if (client.supportsSignIn(name)) {
        const challenge = await api.challenge()
        const result = await client.signIn(name, challenge.signInInput)
        walletAddress = result.account.address
        signature = result.signature
        message = new TextDecoder().decode(result.signedMessage)
      } else {
        const connected = await client.connect(name)
        const challenge = await api.challenge(connected.address)
        if (!challenge.message) throw new Error('The API did not return a wallet-bound SIWS message.')
        const signed = await client.signMessage(new TextEncoder().encode(challenge.message))
        walletAddress = connected.address
        signature = signed.signature
        message = new TextDecoder().decode(signed.signedMessage)
      }
      const nextSession = await api.verify({
        walletAddress,
        signature: bytesToBase64(signature),
        message,
      })
      queryClient.setQueryData(queryKeys.session, nextSession)
      await queryClient.invalidateQueries({ queryKey: queryKeys.portfolio })
    } catch (cause) {
      await client.disconnect().catch(() => undefined)
      const message = errorMessage(cause)
      setError(message)
      throw cause
    } finally {
      setBusyWallet(null)
    }
  }, [client, queryClient])

  const disconnect = useCallback(async () => {
    setError(null)
    await api.signOut().catch(() => undefined)
    await client.disconnect()
    queryClient.removeQueries({ queryKey: queryKeys.portfolio })
    queryClient.setQueryData(queryKeys.session, null)
  }, [client, queryClient])

  const value = useMemo<WalletContextValue>(() => ({
    wallets,
    account,
    rawAccount,
    session,
    busyWallet,
    error,
    connect,
    disconnect,
    signAllTransactions: (transactions) => client.signAllTransactions(transactions),
  }), [wallets, account, rawAccount, session, client, busyWallet, error, connect, disconnect])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext)
  if (!value) throw new Error('useWallet must be used inside WalletProvider.')
  return value
}
