import type { ProviderId } from '@prm/shared'
import type { StoredAccount, Store } from '../store'

export interface ConnectResult {
  /** Stable provider-side id, so reconnecting the same account updates it in place. */
  externalId: string
  label: string
  tokens: unknown
}

export interface ConnectContext {
  openBrowser(url: string): Promise<void>
  signal: AbortSignal
}

export interface SyncContext<Tokens> {
  account: StoredAccount<Tokens>
  store: Store
  now: number
}

/**
 * One integration (Google, Notion, and later Microsoft). An adapter runs its
 * OAuth flow and writes fresh items into the store; the UI never talks to it directly.
 */
export interface ProviderAdapter<Tokens = unknown> {
  id: ProviderId
  connect(ctx: ConnectContext): Promise<ConnectResult>
  sync(ctx: SyncContext<Tokens>): Promise<void>
}
