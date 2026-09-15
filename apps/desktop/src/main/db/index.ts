import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from './migrations'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

export function openDb(filename: string): Db {
  const sqlite = new Database(filename)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  // Overwrite deleted rows with zeros so disconnected accounts don't linger in free pages.
  sqlite.pragma('secure_delete = ON')
  migrate(sqlite)
  return drizzle(sqlite, { schema })
}

export { schema }
