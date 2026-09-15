import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { AccountStatus, ItemKind, ProviderId, WidgetType } from '@prm/shared'

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    provider: text('provider').$type<ProviderId>().notNull(),
    /** Stable provider-side id (Google `sub`, Notion workspace id) so reconnecting updates in place. */
    externalId: text('external_id').notNull(),
    label: text('label').notNull(),
    /** JSON token bundle encrypted with Electron safeStorage. Never leaves the main process. */
    tokens: blob('tokens', { mode: 'buffer' }).notNull(),
    status: text('status').$type<AccountStatus>().notNull().default('connected'),
    lastSyncedAt: integer('last_synced_at'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [uniqueIndex('accounts_provider_external').on(t.provider, t.externalId)],
)

export const items = sqliteTable(
  'items',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ItemKind>().notNull(),
    externalId: text('external_id').notNull(),
    /** Partition replaced atomically on each sync, e.g. a Notion data source id. */
    groupKey: text('group_key').notNull().default(''),
    /** Event start, email received time, or Notion edit time (epoch ms). */
    sortAt: integer('sort_at').notNull(),
    payload: text('payload').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.accountId, t.kind, t.groupKey, t.externalId] }),
    index('items_kind_sort').on(t.kind, t.sortAt),
  ],
)

export const widgets = sqliteTable('widgets', {
  id: text('id').primaryKey(),
  type: text('type').$type<WidgetType>().notNull(),
  config: text('config').notNull(),
  layout: text('layout').notNull(),
  position: integer('position').notNull(),
})
