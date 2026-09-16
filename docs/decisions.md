# Design decisions

Short architecture decision records (ADRs). Each covers what was decided, why, and what it costs. Before reversing one, check that its context no longer applies. Add new decisions at the end, and mark replaced ones **Superseded by ADR-NNN**.

---

## ADR-001: Desktop app on Electron

**Status:** Accepted (2026-09)

**Context:** The goal is a personal dashboard that may later be sold. The options were a hosted web app (Next.js), Electron, or Tauri.

**Decision:** Build an Electron desktop app with a Vite + React + TypeScript renderer. Next.js was dropped because its server features (API routes, SSR, Auth.js) don't apply inside a desktop shell.

**Consequences:**

- Everything is TypeScript, and the renderer can use the whole React ecosystem.
- Mature packaging, signing and auto-update tooling.
- Larger binaries and more memory use than Tauri.
- Distribution means code signing and installers instead of a URL.

## ADR-002: Local-first data

**Status:** Accepted (2026-09)

**Context:** The app reads email, calendars and notes. Hosting that data creates privacy obligations and, for Gmail's restricted scope, heavier Google verification requirements.

**Decision:** All tokens and provider data stay on the user's computer. The main process calls provider APIs directly and caches results in SQLite.

**Consequences:**

- There's no backend database to secure or pay for, and the app works offline.
- Google's security assessment for restricted scopes may not apply, since data never reaches our servers. This must be confirmed during verification.
- No cross-device sync. Each computer connects and syncs on its own.

## ADR-003: Stateless auth proxy for Notion

**Status:** Accepted (2026-09)

**Context:**

- Notion's token exchange requires a client secret, which can't be kept secret inside a distributed app.
- Notion requires fixed HTTPS redirect URIs.
- Asking users to paste internal integration tokens would be a poor experience for paying customers.

**Decision:** Deploy three Vercel functions that hold the secret:

- **callback:** redirects only to `127.0.0.1`.
- **token:** exchanges codes and refresh tokens.
- **revoke:** revokes tokens on disconnect.

They store nothing. The desktop app validates `state`.

**Consequences:**

- A normal "Connect Notion" button that works on every install.
- One small hosted dependency: if the proxy is down, new Notion connections and refreshes fail, though cached data and existing tokens keep working.
- The rate limit is per instance (see [security](security.md#known-limitations)).

## ADR-004: Inline SQL migrations

**Status:** Accepted (2026-09)

**Context:** drizzle-kit generates migration folders that would have to ship as extra resources in the packaged app.

**Decision:** Use Drizzle for typed queries, but store migrations as an append-only array of SQL strings in `db/migrations.ts`, tracked by `PRAGMA user_version`.

**Consequences:**

- Nothing extra to package, and migrations run synchronously at startup.
- `schema.ts` must be updated by hand to match.
- Migrations are SQL-only (see the [development guide](development.md#add-a-database-migration)).

## ADR-005: better-sqlite3 without native rebuilds

**Status:** Accepted (2026-09)

**Context:** Native modules normally have to be rebuilt for Electron's ABI. `electron-builder install-app-deps` looped inside npm workspaces, and node-gyp breaks on the space in the project path.

**Decision:** Use `better-sqlite3` v13, which ships Node-API prebuilds that load in Electron unchanged. Set `npmRebuild: false`.

**Consequences:** Builds are fast and reliable. Before upgrading `better-sqlite3` or Electron, confirm Node-API prebuilds still exist for every target platform.

## ADR-006: App-level AES-GCM encryption for the cache

**Status:** Accepted (2026-09)

**Context:**

- Cached email subjects, events and Notion titles were stored in plaintext.
- SQLCipher would need a different native module, and with it the rebuild problems from ADR-005.

**Decision:**

- Encrypt each item payload with AES-256-GCM using a random data key.
- Wrap that key with Electron `safeStorage` (the OS keychain).
- Migration v2 drops the old plaintext cache and vacuums the file.

**Consequences:**

- No new native dependency, tamper detection built in, and the cache stays disposable.
- Metadata (labels, IDs, timestamps) stays plaintext.
- A keychain reset discards the cache, and accounts must reconnect.

## ADR-007: Electron fuses and the app:// protocol

**Status:** Accepted (2026-09)

**Context:** A signed Electron app can be reused as a generic Node runtime (`ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, `--inspect`) by malware that wants its keychain access. `file://` pages get extra privileges.

**Decision:**

- Flip the fuses at package time: RunAsNode, NODE_OPTIONS and CLI inspect off; ASAR integrity and load-only-from-ASAR on; `file://` extra privileges off.
- Serve the renderer from a privileged `app://renderer` scheme.
- Ad-hoc sign local builds so the modified binary still launches.

**Consequences:**

- `process.fork` and `ELECTRON_RUN_AS_NODE` don't work in packaged builds; use `utilityProcess` if a child process is ever needed.
- Debugging the packaged main process via `--inspect` is disabled.
- Distribution requires real signing (see the [release guide](release.md)).

## ADR-008: Read-only scopes for the MVP

**Status:** Accepted (2026-09)

**Context:** Write features (mark as read, create events, check off tasks) need broader scopes, more UI and more verification scrutiny.

**Decision:** Request only `calendar.readonly`, `gmail.readonly` and Notion read content.

**Consequences:**

- Smaller blast radius if something goes wrong, and simpler Google verification.
- Adding actions later means new scopes, so every user must reconnect.
