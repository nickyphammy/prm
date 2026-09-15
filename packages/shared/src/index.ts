export type ProviderId = 'google' | 'notion'

export type AccountStatus = 'connected' | 'needs_reauth' | 'error'

/** Account info safe to hand to the renderer: never includes tokens. */
export interface AccountSummary {
  id: string
  provider: ProviderId
  /** Email address for Google, workspace name for Notion. */
  label: string
  status: AccountStatus
  lastSyncedAt: number | null
  lastError: string | null
}

export type ItemKind = 'event' | 'email' | 'notion'

export interface NormalizedEvent {
  kind: 'event'
  id: string
  accountId: string
  calendarName: string
  title: string
  /** Epoch ms. For all-day events this is local midnight of the start date. */
  start: number
  end: number
  allDay: boolean
  location: string | null
  url: string | null
  color: string | null
}

export interface NormalizedEmail {
  kind: 'email'
  id: string
  accountId: string
  threadId: string
  from: string
  subject: string
  snippet: string
  receivedAt: number
  unread: boolean
  important: boolean
  url: string
}

export interface NotionItem {
  kind: 'notion'
  id: string
  accountId: string
  /** Notion data source (database) the item belongs to, or null for a recent page. */
  dataSourceId: string | null
  title: string
  status: string | null
  date: number | null
  editedAt: number
  url: string
  icon: string | null
}

export type DashboardItem = NormalizedEvent | NormalizedEmail | NotionItem

export interface NotionDataSourceOption {
  id: string
  title: string
}

export type WidgetType = 'agenda' | 'inbox' | 'notion'

export interface WidgetConfigMap {
  agenda: { days: number }
  inbox: { filter: 'unread' | 'important' | 'all' }
  notion: { dataSourceId: string | null }
}

export interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
}

export type Widget = {
  [T in WidgetType]: { id: string; type: T; config: WidgetConfigMap[T]; layout: WidgetLayout }
}[WidgetType]

export interface SyncState {
  running: boolean
  lastRunAt: number | null
}

/** Result wrapper so errors cross IPC as data instead of opaque rejections. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * The typed API the preload script exposes as `window.api`.
 * Every method maps 1:1 to an ipcMain.handle channel of the same name.
 */
export interface DesktopApi {
  listAccounts(): Promise<AccountSummary[]>
  /** Opens the system browser for OAuth and resolves once the user finishes (or cancels). */
  connect(provider: ProviderId): Promise<Result<AccountSummary>>
  /** Abandons an in-progress connect(), e.g. when the user closed the browser tab. */
  cancelConnect(): Promise<void>
  disconnect(accountId: string): Promise<Result<void>>

  listEvents(range: { from: number; to: number }): Promise<NormalizedEvent[]>
  listEmails(filter: WidgetConfigMap['inbox']['filter']): Promise<NormalizedEmail[]>
  listNotionItems(dataSourceId: string | null): Promise<NotionItem[]>
  listNotionDataSources(): Promise<Result<NotionDataSourceOption[]>>

  listWidgets(): Promise<Widget[]>
  saveWidgets(widgets: Widget[]): Promise<void>

  syncNow(): Promise<void>
  getSyncState(): Promise<SyncState>
  openExternal(url: string): Promise<void>

  /** Subscribe to main-process notifications. Returns an unsubscribe function. */
  onDataUpdated(listener: () => void): () => void
  onSyncStateChanged(listener: (state: SyncState) => void): () => void
}

export const IPC_EVENTS = {
  dataUpdated: 'event:data-updated',
  syncState: 'event:sync-state',
} as const
