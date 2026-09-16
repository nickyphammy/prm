# PRM Dashboard — project brief

Orientation for anyone (human or agent) picking up work here. It covers what must stay
true, how to work, and where the real detail lives. It does not repeat `docs/`; it points
at it.

## What this is

A **local-first Electron desktop app** that shows Google Calendar, Gmail and Notion in a
draggable widget grid. Tokens and cached content never leave the user's computer. The only
server is `apps/auth-proxy`: three stateless Vercel functions that exist solely because
Notion's OAuth needs a client secret and a fixed HTTPS redirect URI.

Personal tool today, possibly a paid product later — which is why security, revocation and
signing are treated as first-class rather than deferred.

## Current state (2026-09)

- **Version:** `0.1.0`, not distributed. Local builds are ad-hoc signed only.
- **Working:** Agenda / Inbox / Notion widgets, Google + Notion OAuth, background sync,
  encrypted offline cache, connect / reconnect / disconnect.
- **Next up** (see `docs/roadmap.md`): Outlook via Microsoft Graph, more widgets, widget and
  sync settings, theme choice, menu-bar glance, onboarding, Playwright UI tests.
- **Known gap:** the Vercel proxy is _not_ linked to Git, so pushing does not redeploy it
  (`docs/release.md`).

## Layout

```
apps/desktop/src/main       Node side: OAuth, provider APIs, sync, SQLite, keychain. Owns every secret.
apps/desktop/src/preload    contextBridge only. No logic.
apps/desktop/src/renderer   React UI. Sandboxed. Reads data only through window.api.
apps/auth-proxy             Vercel functions holding NOTION_CLIENT_SECRET. Stores nothing.
packages/shared/src/index.ts  The IPC contract + normalized types. Single source of truth.
docs/                       Architecture, auth flows, data and sync, security, setup, development, release, ADRs, roadmap.
```

## Invariants

Break one of these and the app's security story stops being true. If a task seems to need
it broken, stop and raise it rather than working around it.

1. **Secrets never cross IPC.** The renderer gets `AccountSummary` and normalized items.
   Never tokens, never raw provider responses.
2. **Every IPC handler validates its arguments** with `assert(...)` in `main/ipc.ts`. The
   renderer is treated as untrusted input because it renders email and Notion content.
3. **Personal content goes through `Store`,** which encrypts payloads with AES-256-GCM.
   Never add a plaintext column holding user content. Plaintext today is limited to account
   labels, item IDs and timestamps — keep it that way.
4. **`main` owns all side effects.** Network, filesystem, keychain and database access live
   in `src/main`. The renderer calls nothing external.
5. **Migrations are append-only.** Never edit an existing entry in `db/migrations.ts`;
   installed apps have already run it. See the `db-migration` skill.
6. **Read-only scopes** unless a feature genuinely needs writes (ADR-008). New scopes force
   every existing user to reconnect.
7. **`openExternal` accepts `https://` only.** All outbound links go through it.
8. **The proxy stores nothing** and forwards only token and workspace fields — never the
   owner's email or profile.
9. **Adapters throw `AuthRevokedError`** when credentials are dead, so sync can mark the
   account `needs_reauth` instead of showing a generic failure.
10. **Provider shapes are normalized at the edge** — inside the fetcher, into
    `NormalizedEvent` / `NormalizedEmail` / `NotionItem`. Widgets never see raw API JSON.

## How to work here

**Verification gate.** Before calling any change done:

```sh
npm test && npm run typecheck && npm run lint
```

Add `npm audit` before a release. UI changes are not covered by tests — verify them in the
running app (`run-desktop-app` skill).

**Conventions** (full list in `docs/development.md`):

- Keep logic in modules that don't import `electron`, and take an injectable `fetchFn`, so
  Vitest can test them directly. Electron-bound glue stays thin.
- Tests sit beside code as `*.test.ts`. Store tests use real in-memory SQLite.
- Errors the UI displays cross IPC as `Result<T>`, not rejected promises.
- Prettier: no semicolons, single quotes, 100 columns. Run `npm run format`.
- Commits use `feat:` / `fix:` / `docs:` / `chore:` prefixes.
- Finished work moves from `docs/roadmap.md` into `CHANGELOG.md` under Unreleased.

**Adding a vertical slice** is always the same spine: shared type → main handler → preload
bridge → renderer hook → component. TypeScript fails the build at every step you skip.

**Decisions.** `docs/decisions.md` holds the ADRs. Before reversing one, check that its
context no longer applies, then add a new ADR marking the old one superseded.

## Skills

Project skills live in `.claude/skills/`:

| Skill             | Use it when                                               |
| ----------------- | --------------------------------------------------------- |
| `add-provider`    | Adding an integration (Outlook / Microsoft Graph is next) |
| `add-widget`      | Adding or changing a dashboard widget                     |
| `extend-ipc`      | Exposing new data or an action to the renderer            |
| `db-migration`    | Changing the SQLite schema or stored shape                |
| `run-desktop-app` | Launching, screenshotting or manually verifying the app   |
| `ship-release`    | Building, signing, verifying and tagging a release        |

## Traps

- `MAIN_VITE_*` values are compiled in at build time from `apps/desktop/.env`. Changing
  `.env` needs a restart of `npm run dev`, not just a hot reload.
- Only the renderer hot-reloads. Main and preload changes need a restart.
- Google keeps this app in **Testing**, so refresh tokens expire after 7 days and the UI
  shows Reconnect. That is expected, not a bug, until the app is verified.
- The project path contains a space, which breaks node-gyp. `better-sqlite3` is used
  specifically because it needs no native rebuild (`npmRebuild: false`, ADR-005). Confirm
  Node-API prebuilds still exist before upgrading it or Electron.
- Packaged builds disable `--inspect` and `ELECTRON_RUN_AS_NODE` via fuses (ADR-007), so
  debug the packaged main process by other means and use `utilityProcess` if a child
  process is ever needed.
- Local data lives at `~/Library/Application Support/PRM Dashboard/prm.db` on macOS. Delete
  it to reset. Item payloads are encrypted, so inspect them through the app, not `sqlite3`.
