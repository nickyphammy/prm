import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm'
import type {
  AccountStatus,
  AccountSummary,
  DashboardItem,
  ItemKind,
  NormalizedEmail,
  NormalizedEvent,
  NotionItem,
  ProviderId,
  Widget,
  WidgetConfigMap,
} from '@prm/shared'
import { schema, type Db } from './db'

const { accounts, items, widgets } = schema

export interface TokenCodec {
  encrypt(value: unknown): Buffer
  decrypt<T>(blob: Buffer): T
}

export interface StoredAccount<T = unknown> extends AccountSummary {
  externalId: string
  tokens: T
}

export const DEFAULT_WIDGETS: Widget[] = [
  { id: 'agenda', type: 'agenda', config: { days: 7 }, layout: { x: 0, y: 0, w: 4, h: 9 } },
  { id: 'inbox', type: 'inbox', config: { filter: 'unread' }, layout: { x: 4, y: 0, w: 4, h: 9 } },
  {
    id: 'notion',
    type: 'notion',
    config: { dataSourceId: null },
    layout: { x: 8, y: 0, w: 4, h: 9 },
  },
]

function sortKey(item: DashboardItem): number {
  if (item.kind === 'event') return item.start
  if (item.kind === 'email') return item.receivedAt
  return item.editedAt
}

type AccountRow = typeof accounts.$inferSelect

function toSummary(row: AccountRow): AccountSummary {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt,
    lastError: row.lastError,
  }
}

export class Store {
  constructor(
    private readonly db: Db,
    private readonly codec: TokenCodec,
  ) {}

  // ── Accounts ────────────────────────────────────────────────────────────

  listAccounts(): AccountSummary[] {
    return this.db.select().from(accounts).orderBy(asc(accounts.createdAt)).all().map(toSummary)
  }

  getAccount<T>(id: string): StoredAccount<T> | null {
    const row = this.db.select().from(accounts).where(eq(accounts.id, id)).get()
    if (!row) return null
    return {
      ...toSummary(row),
      externalId: row.externalId,
      tokens: this.codec.decrypt<T>(row.tokens),
    }
  }

  accountsFor(provider: ProviderId): AccountSummary[] {
    return this.listAccounts().filter((a) => a.provider === provider)
  }

  /** Insert, or update in place when the same provider account is connected again. */
  upsertAccount(input: {
    provider: ProviderId
    externalId: string
    label: string
    tokens: unknown
  }): AccountSummary {
    const existing = this.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.provider, input.provider), eq(accounts.externalId, input.externalId)))
      .get()
    const encrypted = this.codec.encrypt(input.tokens)
    if (existing) {
      this.db
        .update(accounts)
        .set({ label: input.label, tokens: encrypted, status: 'connected', lastError: null })
        .where(eq(accounts.id, existing.id))
        .run()
      return toSummary({ ...existing, label: input.label, status: 'connected', lastError: null })
    }
    const row: AccountRow = {
      id: randomUUID(),
      provider: input.provider,
      externalId: input.externalId,
      label: input.label,
      tokens: encrypted,
      status: 'connected',
      lastSyncedAt: null,
      lastError: null,
      createdAt: Date.now(),
    }
    this.db.insert(accounts).values(row).run()
    return toSummary(row)
  }

  saveTokens(accountId: string, tokens: unknown): void {
    this.db
      .update(accounts)
      .set({ tokens: this.codec.encrypt(tokens) })
      .where(eq(accounts.id, accountId))
      .run()
  }

  setAccountStatus(
    accountId: string,
    status: AccountStatus,
    error: string | null,
    syncedAt?: number,
  ): void {
    this.db
      .update(accounts)
      .set({ status, lastError: error, ...(syncedAt ? { lastSyncedAt: syncedAt } : {}) })
      .where(eq(accounts.id, accountId))
      .run()
  }

  deleteAccount(accountId: string): void {
    // items cascade via the foreign key
    this.db.delete(accounts).where(eq(accounts.id, accountId)).run()
  }

  // ── Items ───────────────────────────────────────────────────────────────

  /** Atomically replace one partition of cached items with a fresh sync result. */
  replaceItems(accountId: string, kind: ItemKind, groupKey: string, next: DashboardItem[]): void {
    this.db.transaction((tx) => {
      tx.delete(items)
        .where(
          and(eq(items.accountId, accountId), eq(items.kind, kind), eq(items.groupKey, groupKey)),
        )
        .run()
      const rows = next.map((item) => ({
        accountId,
        kind,
        groupKey,
        externalId: item.id,
        sortAt: sortKey(item),
        payload: JSON.stringify(item),
      }))
      // Chunk to stay well under SQLite's bound-parameter limit.
      for (let i = 0; i < rows.length; i += 500) {
        tx.insert(items)
          .values(rows.slice(i, i + 500))
          .onConflictDoNothing()
          .run()
      }
    })
  }

  /** Drop Notion partitions for data sources no widget shows anymore. */
  pruneGroups(accountId: string, kind: ItemKind, keep: Set<string>): void {
    const groups = this.db
      .selectDistinct({ groupKey: items.groupKey })
      .from(items)
      .where(and(eq(items.accountId, accountId), eq(items.kind, kind)))
      .all()
    for (const { groupKey } of groups) {
      if (!keep.has(groupKey)) this.replaceItems(accountId, kind, groupKey, [])
    }
  }

  listEvents(range: { from: number; to: number }): NormalizedEvent[] {
    return this.db
      .select({ payload: items.payload })
      .from(items)
      .where(and(eq(items.kind, 'event'), lte(items.sortAt, range.to)))
      .orderBy(asc(items.sortAt))
      .all()
      .map((r) => JSON.parse(r.payload) as NormalizedEvent)
      .filter((e) => e.end > range.from)
  }

  listEmails(filter: WidgetConfigMap['inbox']['filter']): NormalizedEmail[] {
    return this.db
      .select({ payload: items.payload })
      .from(items)
      .where(eq(items.kind, 'email'))
      .orderBy(desc(items.sortAt))
      .all()
      .map((r) => JSON.parse(r.payload) as NormalizedEmail)
      .filter((e) => filter === 'all' || (filter === 'unread' ? e.unread : e.important))
  }

  listNotionItems(dataSourceId: string | null): NotionItem[] {
    return this.db
      .select({ payload: items.payload })
      .from(items)
      .where(and(eq(items.kind, 'notion'), eq(items.groupKey, dataSourceId ?? '')))
      .orderBy(desc(items.sortAt))
      .all()
      .map((r) => JSON.parse(r.payload) as NotionItem)
  }

  // ── Widgets ─────────────────────────────────────────────────────────────

  listWidgets(): Widget[] {
    const rows = this.db.select().from(widgets).orderBy(asc(widgets.position)).all()
    if (rows.length === 0 && !this.widgetsInitialized()) return DEFAULT_WIDGETS
    return rows.map(
      (r) =>
        ({
          id: r.id,
          type: r.type,
          config: JSON.parse(r.config),
          layout: JSON.parse(r.layout),
        }) as Widget,
    )
  }

  saveWidgets(next: Widget[]): void {
    this.db.transaction((tx) => {
      tx.delete(widgets).run()
      if (next.length > 0) {
        tx.insert(widgets)
          .values(
            next.map((w, position) => ({
              id: w.id,
              type: w.type,
              config: JSON.stringify(w.config),
              layout: JSON.stringify(w.layout),
              position,
            })),
          )
          .run()
      }
      // Remember that the user has saved a layout, so an intentionally empty dashboard stays empty.
      tx.run(sql`INSERT OR REPLACE INTO meta (key, value) VALUES ('widgets_saved', '1')`)
    })
  }

  /** Notion data sources currently shown by any widget; sync fetches exactly these. */
  notionDataSourceIds(): string[] {
    return [
      ...new Set(
        this.listWidgets()
          .filter((w): w is Extract<Widget, { type: 'notion' }> => w.type === 'notion')
          .map((w) => w.config.dataSourceId)
          .filter((id): id is string => id !== null),
      ),
    ]
  }

  private widgetsInitialized(): boolean {
    return (
      this.db.get<{ n: number }>(sql`SELECT count(*) AS n FROM meta WHERE key = 'widgets_saved'`)!
        .n > 0
    )
  }
}
