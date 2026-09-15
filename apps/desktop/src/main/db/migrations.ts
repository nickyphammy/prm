import type Database from 'better-sqlite3'

/**
 * Append-only list of migrations; index + 1 is the schema version stored in
 * PRAGMA user_version. Kept inline (rather than drizzle-kit folders) so the
 * packaged app needs no extra resource files. Keep in sync with schema.ts.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    label TEXT NOT NULL,
    tokens BLOB NOT NULL,
    status TEXT NOT NULL DEFAULT 'connected',
    last_synced_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX accounts_provider_external ON accounts (provider, external_id);

  CREATE TABLE items (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    external_id TEXT NOT NULL,
    group_key TEXT NOT NULL DEFAULT '',
    sort_at INTEGER NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (account_id, kind, group_key, external_id)
  );
  CREATE INDEX items_kind_sort ON items (kind, sort_at);

  CREATE TABLE widgets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    config TEXT NOT NULL,
    layout TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  // v2: cached payloads are encrypted (AES-256-GCM blobs). The cache is disposable,
  // so drop the plaintext rows instead of converting them; the next sync refills it.
  `
  DROP TABLE items;
  CREATE TABLE items (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    external_id TEXT NOT NULL,
    group_key TEXT NOT NULL DEFAULT '',
    sort_at INTEGER NOT NULL,
    payload BLOB NOT NULL,
    PRIMARY KEY (account_id, kind, group_key, external_id)
  );
  CREATE INDEX items_kind_sort ON items (kind, sort_at);
  `,
]

/** Migrations that removed plaintext user data, after which free pages must be scrubbed. */
const SCRUB_AFTER = new Set([2])

export function migrate(sqlite: Database.Database): void {
  const current = sqlite.pragma('user_version', { simple: true }) as number
  let scrub = false
  for (let version = current; version < MIGRATIONS.length; version++) {
    sqlite.transaction(() => {
      sqlite.exec(MIGRATIONS[version]!)
      sqlite.pragma(`user_version = ${version + 1}`)
    })()
    if (current > 0 && SCRUB_AFTER.has(version + 1)) scrub = true
  }
  if (scrub) {
    // Rewrite the file so dropped plaintext doesn't linger in free pages or the WAL.
    sqlite.exec('VACUUM')
    sqlite.pragma('wal_checkpoint(TRUNCATE)')
  }
}
