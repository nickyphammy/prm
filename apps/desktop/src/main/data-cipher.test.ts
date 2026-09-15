import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { DataCipher } from './data-cipher'
import { openDb } from './db'
import { MIGRATIONS } from './db/migrations'
import { Store, type TokenCodec } from './store'

const codec: TokenCodec = {
  encrypt: (value) => Buffer.from(JSON.stringify(value)),
  decrypt: <T>(blob: Buffer) => JSON.parse(blob.toString()) as T,
}

const SECRET_SUBJECT = 'Confidential: acquisition of Acme Corp'

const email = (accountId: string) => ({
  kind: 'email' as const,
  id: 'm1',
  accountId,
  threadId: 't1',
  from: 'CEO',
  subject: SECRET_SUBJECT,
  snippet: 'Do not forward',
  receivedAt: 1,
  unread: true,
  important: true,
  url: 'https://mail.google.com',
})

describe('DataCipher', () => {
  it('round-trips and uses a fresh IV each time', () => {
    const cipher = new DataCipher(DataCipher.generateKey())
    const a = cipher.encrypt('hello')
    const b = cipher.encrypt('hello')
    expect(a.equals(b)).toBe(false)
    expect(cipher.decrypt(a)).toBe('hello')
  })

  it('rejects tampered data and the wrong key', () => {
    const cipher = new DataCipher(DataCipher.generateKey())
    const blob = cipher.encrypt('hello')
    blob[blob.length - 1]! ^= 1
    expect(() => cipher.decrypt(blob)).toThrow()
    expect(() => new DataCipher(DataCipher.generateKey()).decrypt(cipher.encrypt('x'))).toThrow()
  })
})

describe('encrypted cache', () => {
  let dir: string | undefined
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  it('never writes cached content to the database in plaintext', () => {
    dir = mkdtempSync(join(tmpdir(), 'prm-'))
    const file = join(dir, 'prm.db')
    const db = openDb(file)
    const store = new Store(db, codec)
    const acc = store.upsertAccount({
      provider: 'google',
      externalId: 's',
      label: 'me',
      tokens: {},
    })
    store.replaceItems(acc.id, 'email', '', [email(acc.id)])
    db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`)

    const raw = Buffer.concat([readFileSync(file), readFileSync(`${file}-wal`, { flag: 'a+' })])
    expect(raw.includes(Buffer.from(SECRET_SUBJECT))).toBe(false)
    expect(store.listEmails('all')[0]?.subject).toBe(SECRET_SUBJECT)
  })

  it('reuses the stored data key across restarts', () => {
    const db = openDb(':memory:')
    const first = new Store(db, codec)
    const acc = first.upsertAccount({
      provider: 'google',
      externalId: 's',
      label: 'me',
      tokens: {},
    })
    first.replaceItems(acc.id, 'email', '', [email(acc.id)])
    expect(new Store(db, codec).listEmails('all')).toHaveLength(1)
  })

  it('discards the cache when the keychain can no longer unwrap the data key', () => {
    const db = openDb(':memory:')
    const store = new Store(db, codec)
    const acc = store.upsertAccount({
      provider: 'google',
      externalId: 's',
      label: 'me',
      tokens: {},
    })
    store.replaceItems(acc.id, 'email', '', [email(acc.id)])

    const resetKeychain: TokenCodec = {
      encrypt: codec.encrypt,
      decrypt: () => {
        throw new Error('Error while decrypting the ciphertext')
      },
    }
    const original = console.error
    console.error = () => {}
    try {
      expect(new Store(db, resetKeychain).listEmails('all')).toEqual([])
    } finally {
      console.error = original
    }
  })

  it('migrates a v1 database by dropping plaintext items and keeping accounts', () => {
    dir = mkdtempSync(join(tmpdir(), 'prm-'))
    const file = join(dir, 'prm.db')
    const v1 = new Database(file)
    v1.exec(MIGRATIONS[0]!)
    v1.pragma('user_version = 1')
    v1.prepare(
      `INSERT INTO accounts (id, provider, external_id, label, tokens, created_at) VALUES ('a', 'notion', 'w', 'ws', x'00', 1)`,
    ).run()
    v1.prepare(
      `INSERT INTO items (account_id, kind, external_id, sort_at, payload) VALUES ('a', 'notion', 'p', 1, ?)`,
    ).run(SECRET_SUBJECT)
    v1.close()

    const store = new Store(openDb(file), codec)
    expect(store.listAccounts().map((a) => a.id)).toEqual(['a'])
    expect(store.listNotionItems(null)).toEqual([])
    expect(readFileSync(file).includes(Buffer.from(SECRET_SUBJECT))).toBe(false)
  })
})
