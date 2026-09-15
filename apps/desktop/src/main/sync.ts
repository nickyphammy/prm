import type { ProviderId, SyncState } from '@prm/shared'
import { AuthRevokedError, errorMessage } from './errors'
import type { ProviderAdapter } from './providers/types'
import type { Store } from './store'

const INTERVAL_MS = 5 * 60 * 1000
/** Focusing the window re-syncs only if the last run is at least this old. */
const FOCUS_STALE_MS = 60 * 1000

export interface SyncEvents {
  dataUpdated(): void
  stateChanged(state: SyncState): void
}

export class SyncService {
  private running: Promise<void> | null = null
  private lastRunAt: number | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly store: Store,
    private readonly adapters: Record<ProviderId, ProviderAdapter<never>>,
    private readonly events: SyncEvents,
  ) {}

  start(): void {
    void this.syncAll()
    this.timer = setInterval(() => void this.syncAll(), INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  state(): SyncState {
    return { running: this.running !== null, lastRunAt: this.lastRunAt }
  }

  onWindowFocus(): void {
    if (this.lastRunAt === null || Date.now() - this.lastRunAt > FOCUS_STALE_MS) void this.syncAll()
  }

  /** Syncs every account. Concurrent callers share the in-flight run. */
  syncAll(): Promise<void> {
    this.running ??= this.run(this.store.listAccounts().map((a) => a.id)).finally(() => {
      this.running = null
      this.lastRunAt = Date.now()
      this.events.stateChanged(this.state())
    })
    this.events.stateChanged(this.state())
    return this.running
  }

  async syncAccount(accountId: string): Promise<void> {
    // Wait for any full run first so two syncs never write the same partitions at once.
    await this.running
    await this.run([accountId])
  }

  private async run(accountIds: string[]): Promise<void> {
    await Promise.all(accountIds.map((id) => this.syncOne(id)))
    this.events.dataUpdated()
  }

  private async syncOne(accountId: string): Promise<void> {
    let account
    try {
      account = this.store.getAccount<never>(accountId)
    } catch (err) {
      // e.g. the OS keychain entry was reset, so the stored tokens can't be decrypted anymore.
      console.error(`[sync] could not read credentials for account ${accountId}:`, err)
      this.store.setAccountStatus(
        accountId,
        'needs_reauth',
        'Saved credentials could not be read. Reconnect this account.',
      )
      return
    }
    // Accounts needing reauth would just fail again; reconnecting resets their status.
    if (!account || account.status === 'needs_reauth') return
    const now = Date.now()
    try {
      await this.adapters[account.provider].sync({ account, store: this.store, now })
      this.store.setAccountStatus(accountId, 'connected', null, now)
    } catch (err) {
      if (err instanceof AuthRevokedError) {
        this.store.setAccountStatus(accountId, 'needs_reauth', err.message)
      } else {
        console.error(`[sync] ${account.provider} account ${accountId} failed:`, err)
        this.store.setAccountStatus(accountId, 'error', errorMessage(err))
      }
    }
  }
}
