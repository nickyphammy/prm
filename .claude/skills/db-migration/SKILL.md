---
name: db-migration
description: Change the PRM Dashboard SQLite schema — add a table or column, change an index, or drop stored data. Use whenever work touches apps/desktop/src/main/db/, the Store's stored shape, or anything persisted in prm.db.
---

# Add a database migration

Migrations are an **append-only array of SQL strings** in
`apps/desktop/src/main/db/migrations.ts`, versioned by `PRAGMA user_version` (index + 1).
They run synchronously at startup, inside a transaction each. Kept inline rather than in
drizzle-kit folders so the packaged app ships no extra resource files (ADR-004).

Reference: `docs/development.md#add-a-database-migration`.

## The rule that matters

**Never edit or reorder an existing entry in `MIGRATIONS`.** Installed apps have already
run it and recorded the version; editing it means their database silently diverges from a
fresh install's. Always append.

## Steps

1. **SQL** — append a new string to `MIGRATIONS`. Comment it with the version and why.
2. **Schema** — update `db/schema.ts` (Drizzle) by hand to match. Nothing checks this for
   you; a mismatch shows up as a runtime query error.
3. **Scrubbing** — if the migration deletes or rewrites data that was stored in
   **plaintext**, add the new version number to `SCRUB_AFTER`. That triggers `VACUUM` plus
   a truncating WAL checkpoint so the old bytes don't linger in free pages. Skipping this
   leaves personal content recoverable from the file.
4. **Test** — build a database at the previous version, run `openDb`, assert the result.
   See the v1 → v2 test in `main/data-cipher.test.ts`.
5. **Store** — update the `Store` methods that read or write the changed tables, and their
   tests in `store.test.ts` (real in-memory SQLite).

## Deciding what a migration should do

- **The item cache is disposable.** It's rebuilt by the next sync, so dropping and
  recreating `items` beats writing conversion logic — that's exactly what v2 did when
  payloads became encrypted blobs.
- **Accounts are not disposable.** Losing a row means the user reconnects and re-grants
  consent. Migrate accounts in place.
- **Migrations are SQL-only.** If a change needs JavaScript (re-encrypting, reshaping
  JSON), do it in `Store` after the migration runs, or treat the data as disposable.
- **New personal content must be encrypted** — store it in an item `payload` through
  `Store` (which applies AES-256-GCM), not as a new plaintext column. Plaintext today is
  limited to labels, IDs and timestamps; keep it that way.

## Check

- `npm test && npm run typecheck && npm run lint`
- **Upgrade test:** run the app against a database created by the previous version (copy
  the real one, or build one in a test) and confirm migrations run and accounts stay
  connected. `sqlite3 <db> 'PRAGMA user_version'` shows the version.
- **Fresh-install test:** delete `~/Library/Application Support/PRM Dashboard/prm.db` and
  start the app — all migrations should run from zero.
