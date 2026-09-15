import { ipcMain, shell } from 'electron'
import type { DesktopApi, ProviderId, Result, Widget } from '@prm/shared'
import { ConnectCancelledError, errorMessage } from './errors'
import { listAllDataSources } from './providers/notion-adapter'
import type { ProviderAdapter } from './providers/types'
import type { Store } from './store'
import type { SyncService } from './sync'

/** Every renderer-callable method except the event subscriptions, which the preload wires up. */
type Handlers = Omit<DesktopApi, 'onDataUpdated' | 'onSyncStateChanged'>

const PROVIDERS: readonly ProviderId[] = ['google', 'notion']
const INBOX_FILTERS = ['unread', 'important', 'all'] as const

async function toResult<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid IPC arguments: ${message}`)
}

export function registerIpc(deps: {
  store: Store
  sync: SyncService
  adapters: Record<ProviderId, ProviderAdapter<never>>
}): void {
  const { store, sync, adapters } = deps
  let pendingConnect: AbortController | null = null

  const handlers: Handlers = {
    listAccounts: async () => store.listAccounts(),

    connect: async (provider) => {
      assert(PROVIDERS.includes(provider), 'unknown provider')
      pendingConnect?.abort()
      const controller = new AbortController()
      pendingConnect = controller
      const result = await toResult(async () => {
        const connected = await adapters[provider].connect({
          openBrowser: (url) => shell.openExternal(url),
          signal: controller.signal,
        })
        const account = store.upsertAccount({ provider, ...connected })
        await sync.syncAccount(account.id)
        return store.listAccounts().find((a) => a.id === account.id) ?? account
      })
      if (pendingConnect === controller) pendingConnect = null
      // A cancel is the user's choice, not a failure worth showing.
      if (!result.ok && controller.signal.aborted)
        return { ok: false, error: new ConnectCancelledError().message }
      return result
    },

    cancelConnect: async () => {
      pendingConnect?.abort()
      pendingConnect = null
    },

    disconnect: (accountId) =>
      toResult(async () => {
        store.deleteAccount(accountId)
        // Access tokens stay valid until they expire; the user can revoke fully from their Google/Notion settings.
      }),

    listEvents: async (range) => {
      assert(Number.isFinite(range?.from) && Number.isFinite(range?.to), 'range')
      return store.listEvents(range)
    },

    listEmails: async (filter) => {
      assert(INBOX_FILTERS.includes(filter), 'filter')
      return store.listEmails(filter)
    },

    listNotionItems: async (dataSourceId) => {
      assert(dataSourceId === null || typeof dataSourceId === 'string', 'dataSourceId')
      return store.listNotionItems(dataSourceId)
    },

    listNotionDataSources: () => toResult(() => listAllDataSources(store)),

    listWidgets: async () => store.listWidgets(),

    saveWidgets: async (widgets: Widget[]) => {
      assert(Array.isArray(widgets), 'widgets')
      const before = new Set(store.notionDataSourceIds())
      store.saveWidgets(widgets)
      // A newly picked Notion database has no cached items yet, so fetch it right away.
      if (store.notionDataSourceIds().some((id) => !before.has(id))) {
        for (const account of store.accountsFor('notion')) void sync.syncAccount(account.id)
      }
    },

    syncNow: () => sync.syncAll(),

    getSyncState: async () => sync.state(),

    openExternal: async (url) => {
      assert(typeof url === 'string' && /^https:\/\//.test(url), 'only https URLs can be opened')
      await shell.openExternal(url)
    },
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_event, ...args: unknown[]) =>
      (handler as (...a: unknown[]) => unknown)(...args),
    )
  }
}
