# Development guide

## Commands

Run these from the repo root.

| Command                                  | What it does                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                            | Start the desktop app with hot reload for the renderer     |
| `npm test`                               | Run every Vitest suite (desktop, proxy, shared)            |
| `npx vitest apps/desktop/src/main/store` | Run tests matching a path, in watch mode                   |
| `npm run typecheck`                      | `tsc` for every workspace (main, preload, renderer, proxy) |
| `npm run lint`                           | ESLint                                                     |
| `npm run format`                         | Prettier (no semicolons, single quotes, 100 columns)       |
| `npm run build:mac -w apps/desktop`      | Build a signed `.dmg` into `apps/desktop/release/`         |
| `npm run build:unpack -w apps/desktop`   | Build an unpacked `.app`, for quick packaging checks       |

The renderer hot-reloads. Changes to main, preload or `.env` need a restart of `npm run dev`.

## Conventions

- **Main owns side effects.** Network, keychain, filesystem and database access live in `src/main`. The renderer gets data only through `window.api`.
- **Keep logic testable.** Put API calls and mappers in modules that don't import `electron`, and accept a `fetchFn` parameter so tests can pass a fake. The Electron-bound glue (`index.ts`, `ipc.ts`, `secrets.ts`, adapters' `connect`) stays thin.
- **Normalize at the edge.** Provider responses are mapped to the shared types (`NormalizedEvent`, `NormalizedEmail`, `NotionItem`) inside the fetcher. Widgets never see raw API shapes.
- **Errors carry meaning.**
  - Throw `AuthRevokedError` when credentials are dead, so sync marks the account for reconnect.
  - Throw `HttpError` or plain errors for everything else.
  - Return `Result` across IPC when the UI shows the message.
- **Tests sit next to code** as `*.test.ts`. `better-sqlite3` works under Vitest, so store tests use real in-memory databases.
- **Commits** follow `feat:`, `fix:`, `docs:`, `chore:` prefixes.

## Add a widget

Example: a "Next meeting" widget built from calendar data you already have.

1. **Type.** In `packages/shared/src/index.ts`, add the type to `WidgetType` and its config to `WidgetConfigMap`:
   ```ts
   export type WidgetType = 'agenda' | 'inbox' | 'notion' | 'nextMeeting'
   export interface WidgetConfigMap {
     // …
     nextMeeting: { showLocation: boolean }
   }
   ```
2. **Component.** Create `apps/desktop/src/renderer/src/widgets/NextMeetingWidget.tsx`:
   - Accept `WidgetProps<'nextMeeting'>`.
   - Wrap the content in `<WidgetFrame>` and `<RequireAccount provider="google">`.
   - Read data with the existing hooks from `lib/api.ts` (here, `useEvents`).
3. **Register.** Add an entry to `WIDGETS` in `widgets/registry.tsx` with a title, description, icon, component and `create()` (default config and size). The **Add widget** menu picks it up automatically.
4. **Test.** Put any non-trivial logic (grouping, filtering) in `renderer/src/lib/` as a pure function with a `*.test.ts`, like `lib/agenda.ts`.

Needs data that isn't cached yet? Extend the provider's fetcher and mapper first, then add an IPC method (next section).

## Add an IPC method

TypeScript enforces each step, so a missed one fails `npm run typecheck`.

1. **Contract:** add the method to `DesktopApi` in `packages/shared/src/index.ts`.
2. **Handler:** implement it in `apps/desktop/src/main/ipc.ts`. The `Handlers` type requires every method. Validate arguments with `assert(...)`, and never return tokens.
3. **Bridge:** add it to the `api` object in `apps/desktop/src/preload/index.ts` with `invoke('methodName')`.
4. **Hook:** wrap it in a TanStack Query hook in `apps/desktop/src/renderer/src/lib/api.ts`. Put cached-data queries under the `['data', …]` key so they refresh after each sync.

## Add a provider

Example: Microsoft (Outlook mail and calendar) via Microsoft Graph.

1. **Types:** add `'microsoft'` to `ProviderId` in `packages/shared`.
2. **OAuth:** create `src/main/oauth/microsoft.ts`, modeled on `google.ts`:
   - Register a _public client_ app in Microsoft Entra with a "Mobile and desktop" redirect of `http://localhost`. Microsoft allows any port on loopback redirects.
   - Use PKCE. Scopes: `offline_access User.Read Calendars.Read Mail.Read`.
   - Microsoft public clients don't need a secret, so no proxy is required.
3. **Fetchers and mappers:** create `src/main/providers/outlook-calendar.ts` and `outlook-mail.ts`. Map Graph responses to `NormalizedEvent` and `NormalizedEmail`, with fixture-based tests.
4. **Adapter:** create `src/main/providers/microsoft-adapter.ts`, implementing `connect`, `sync` (replace the `event` and `email` partitions) and `revoke`. Graph has no simple per-app token revocation endpoint (check current docs). If revocation isn't possible, throw so the UI shows the "remove it in your account settings" link.
5. **Wire it up:**
   - Add it to the `adapters` map in `src/main/index.ts` and to `PROVIDERS` in `src/main/ipc.ts`.
   - Add `MAIN_VITE_MICROSOFT_CLIENT_ID` to `env.ts` and `.env.example`.
6. **UI:**
   - Add entries to `PROVIDERS` and `REVOKE_PAGES` in `pages/Settings.tsx`, `MARKS` in `components/ProviderIcon.tsx`, and `PROVIDER_NAMES` in `widgets/common.tsx`.
   - The Agenda and Inbox widgets currently require a `google` account. Generalize `RequireAccount` to accept a list of providers.

Calendar and mail items from every provider share the `event` and `email` kinds, so existing widgets show them together.

## Add a database migration

1. **SQL:** append a new SQL string to `MIGRATIONS` in `src/main/db/migrations.ts`. **Never edit an existing entry.** Installed apps have already run it.
2. **Schema:** update `src/main/db/schema.ts` to match.
3. **Scrubbing:** if the migration deletes or rewrites personal data that was stored in plaintext, add its version number (index + 1) to `SCRUB_AFTER` so the file is vacuumed.
4. **Test:** build a database at the previous version, run `openDb`, and assert the result. See the v1 → v2 test in `src/main/data-cipher.test.ts`.

Migrations are SQL-only. If a change needs JavaScript (for example re-encrypting data), do it in `Store` after the migration, or treat the cache as disposable and let sync refill it.

## Run and debug

- **Renderer DevTools:** in dev, open with **View → Toggle Developer Tools** (⌥⌘I).
- **Main process logs:** they print in the terminal running `npm run dev`. Sync failures are logged with the full error, including its `cause`.
- **Remote debugging and screenshots:** `cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9222`, then connect to `http://127.0.0.1:9222/json` with any Chrome DevTools Protocol client.
- **Inspect the database:** `sqlite3 ~/Library/Application\ Support/PRM\ Dashboard/prm.db`. Item payloads are encrypted, so read them through the app.
- **Packaged build in an isolated profile.** Use this to leave your real data and the running dev app alone:
  ```sh
  "apps/desktop/release/<version>/mac-arm64/PRM Dashboard.app/Contents/MacOS/PRM Dashboard" \
    --user-data-dir=/tmp/prm-test --use-mock-keychain --remote-debugging-port=9333
  ```
  `--use-mock-keychain` avoids macOS keychain prompts during automated checks. Never use it for real data.
- **Fuses:** check them with `npx @electron/fuses read --app "apps/desktop/release/<version>/mac-arm64/PRM Dashboard.app"`.

## Testing strategy

| Layer                | How it's tested                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| API mappers          | Fixture JSON → expected normalized objects (`gcal`, `gmail`, `notion` tests)                      |
| Fetchers             | Fake `fetchFn` checking URLs, pagination and concurrency, and 401 → `AuthRevokedError`            |
| OAuth                | URL building, token refresh and expiry skew, `invalid_grant` handling, a real loopback server     |
| Store and migrations | Real SQLite (in memory or temp file): partitions, filters, cascade, encryption, v1 → v2 migration |
| Sync                 | Fake adapters: status transitions, shared in-flight runs, undecryptable credentials               |
| Proxy                | Handlers called directly with `Request` objects; Notion mocked                                    |
| UI                   | Not automated yet. Verify manually or via DevTools screenshots (see above)                        |
