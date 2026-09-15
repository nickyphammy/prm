import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedEmail, NormalizedEvent, Widget } from '@prm/shared'
import { openDb } from './db'
import { DEFAULT_WIDGETS, Store, type TokenCodec } from './store'

// Stand-in for safeStorage: reversible but not plaintext, so tests catch accidental double-encoding.
const codec: TokenCodec = {
  encrypt: (value) => Buffer.from(JSON.stringify(value)).reverse(),
  decrypt: <T>(blob: Buffer) => JSON.parse(Buffer.from(blob).reverse().toString()) as T,
}

const event = (id: string, start: number, end: number): NormalizedEvent => ({
  kind: 'event',
  id,
  accountId: 'x',
  calendarName: 'Cal',
  title: id,
  start,
  end,
  allDay: false,
  location: null,
  url: null,
  color: null,
})

const email = (
  id: string,
  receivedAt: number,
  flags: { unread?: boolean; important?: boolean },
): NormalizedEmail => ({
  kind: 'email',
  id,
  accountId: 'x',
  threadId: id,
  from: 'a',
  subject: id,
  snippet: '',
  receivedAt,
  unread: flags.unread ?? false,
  important: flags.important ?? false,
  url: 'https://mail.google.com',
})

let store: Store

beforeEach(() => {
  store = new Store(openDb(':memory:'), codec)
})

describe('accounts', () => {
  it('round-trips encrypted tokens and never exposes them in summaries', () => {
    const summary = store.upsertAccount({
      provider: 'google',
      externalId: 'sub-1',
      label: 'me@example.com',
      tokens: { a: 1 },
    })
    expect(summary).not.toHaveProperty('tokens')
    expect(store.getAccount(summary.id)?.tokens).toEqual({ a: 1 })
  })

  it('updates in place when the same account reconnects, clearing needs_reauth', () => {
    const first = store.upsertAccount({
      provider: 'google',
      externalId: 'sub-1',
      label: 'old',
      tokens: { v: 1 },
    })
    store.setAccountStatus(first.id, 'needs_reauth', 'expired')
    const second = store.upsertAccount({
      provider: 'google',
      externalId: 'sub-1',
      label: 'new',
      tokens: { v: 2 },
    })
    expect(second.id).toBe(first.id)
    expect(store.listAccounts()).toHaveLength(1)
    expect(store.getAccount(first.id)).toMatchObject({
      label: 'new',
      status: 'connected',
      lastError: null,
      tokens: { v: 2 },
    })
  })

  it('deletes cached items with the account', () => {
    const acc = store.upsertAccount({ provider: 'google', externalId: 's', label: 'l', tokens: {} })
    store.replaceItems(acc.id, 'event', '', [event('e', 10, 20)])
    store.deleteAccount(acc.id)
    expect(store.listEvents({ from: 0, to: 100 })).toEqual([])
  })
})

describe('items', () => {
  it('replaces a partition atomically and filters events overlapping the range', () => {
    const acc = store.upsertAccount({ provider: 'google', externalId: 's', label: 'l', tokens: {} })
    store.replaceItems(acc.id, 'event', '', [event('stale', 50, 60)])
    store.replaceItems(acc.id, 'event', '', [
      event('ended-before', 0, 100),
      event('ongoing', 50, 150),
      event('inside', 120, 130),
      event('after', 300, 310),
    ])
    expect(store.listEvents({ from: 100, to: 200 }).map((e) => e.id)).toEqual(['ongoing', 'inside'])
  })

  it('filters and orders emails newest first', () => {
    const acc = store.upsertAccount({ provider: 'google', externalId: 's', label: 'l', tokens: {} })
    store.replaceItems(acc.id, 'email', '', [
      email('old-unread', 1, { unread: true }),
      email('new-important', 3, { important: true }),
      email('mid-both', 2, { unread: true, important: true }),
    ])
    expect(store.listEmails('all').map((e) => e.id)).toEqual([
      'new-important',
      'mid-both',
      'old-unread',
    ])
    expect(store.listEmails('unread').map((e) => e.id)).toEqual(['mid-both', 'old-unread'])
    expect(store.listEmails('important').map((e) => e.id)).toEqual(['new-important', 'mid-both'])
  })

  it('handles large syncs beyond one insert chunk', () => {
    const acc = store.upsertAccount({ provider: 'google', externalId: 's', label: 'l', tokens: {} })
    const many = Array.from({ length: 1234 }, (_, i) => event(`e${i}`, i, i + 1))
    store.replaceItems(acc.id, 'event', '', many)
    expect(store.listEvents({ from: 0, to: 10_000 })).toHaveLength(1234)
  })

  it('prunes Notion partitions no widget uses', () => {
    const acc = store.upsertAccount({ provider: 'notion', externalId: 'w', label: 'l', tokens: {} })
    const item = (id: string, ds: string | null) => ({
      kind: 'notion' as const,
      id,
      accountId: acc.id,
      dataSourceId: ds,
      title: id,
      status: null,
      date: null,
      editedAt: 1,
      url: 'https://notion.so',
      icon: null,
    })
    store.replaceItems(acc.id, 'notion', '', [item('recent', null)])
    store.replaceItems(acc.id, 'notion', 'ds-keep', [item('k', 'ds-keep')])
    store.replaceItems(acc.id, 'notion', 'ds-drop', [item('d', 'ds-drop')])
    store.pruneGroups(acc.id, 'notion', new Set(['', 'ds-keep']))
    expect(store.listNotionItems(null).map((i) => i.id)).toEqual(['recent'])
    expect(store.listNotionItems('ds-keep')).toHaveLength(1)
    expect(store.listNotionItems('ds-drop')).toEqual([])
  })
})

describe('widgets', () => {
  it('starts with the default layout, then persists what the user saves (even an empty dashboard)', () => {
    expect(store.listWidgets()).toEqual(DEFAULT_WIDGETS)
    const custom: Widget[] = [
      {
        id: 'n',
        type: 'notion',
        config: { dataSourceId: 'ds' },
        layout: { x: 1, y: 2, w: 3, h: 4 },
      },
    ]
    store.saveWidgets(custom)
    expect(store.listWidgets()).toEqual(custom)
    expect(store.notionDataSourceIds()).toEqual(['ds'])
    store.saveWidgets([])
    expect(store.listWidgets()).toEqual([])
  })
})
