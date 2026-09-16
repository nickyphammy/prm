---
name: add-provider
description: Add a new data provider integration (Outlook/Microsoft Graph, Slack, Todoist, Apple Calendar…) to PRM Dashboard — OAuth flow, fetchers, a ProviderAdapter, wiring and UI. Use when asked to "connect X", "add support for X", "integrate X" or "add a provider/account type".
---

# Add a provider

A provider is one `ProviderAdapter` (`connect` / `sync` / `revoke`) plus its OAuth helpers
and API fetchers. Everything else — scheduling, status tracking, encryption, reconnect
prompts — is already generic and needs no changes.

Read `docs/development.md#add-a-provider` for the Microsoft-specific worked example, and
`docs/auth-flows.md` for how the loopback and proxy flows differ. Model new code on
`google-adapter.ts` (loopback + PKCE, no server) or `notion-adapter.ts` (needs the proxy).

## Decide first

- **Can the OAuth flow stay on the device?** If the provider allows loopback redirects and
  public clients, copy the Google shape and add nothing to `apps/auth-proxy`. Only add a
  proxy endpoint if the provider requires a client secret _and_ a fixed HTTPS redirect.
  That is a hosted dependency — call it out before building it.
- **Does its data fit the existing kinds?** Calendar → `event`, mail → `email`. Reusing a
  kind means existing widgets show the new provider's items with no UI work. A genuinely
  new kind (tasks, messages) needs a new `ItemKind`, new store readers and a new widget.
- **Read-only scopes** unless the feature needs writes (ADR-008).

## Steps

1. **Shared types** — `packages/shared/src/index.ts`: add the id to `ProviderId`. If the
   data needs a new shape, add a `Normalized*` interface, extend `ItemKind` and
   `DashboardItem`.

2. **OAuth** — `src/main/oauth/<provider>.ts`, modeled on `google.ts`. Keep it free of
   `electron` imports and take an injectable `fetchFn`. It should export URL building,
   code exchange, a `ensureFresh*Tokens(tokens, client, now)` refresher, and revocation.
   Use PKCE and a random `state`; `startLoopback()` in `oauth/loopback.ts` handles the
   127.0.0.1 listener, random port and 5-minute lifetime.

3. **Fetchers and mappers** — `src/main/providers/<provider>-<resource>.ts`. Use
   `fetchJson` from `main/http.ts` so a 401 becomes `AuthRevokedError`, and
   its bounded-concurrency helper for per-item follow-up requests. Map to the normalized
   types inside the fetcher. Write fixture-based tests for the mapper and a fake-`fetchFn`
   test for pagination and the 401 path.

4. **Adapter** — `src/main/providers/<provider>-adapter.ts` implementing `ProviderAdapter`:
   - `connect` returns `{ externalId, label, tokens }`. `externalId` must be stable so
     reconnecting updates the account in place rather than duplicating it.
   - `sync` refreshes tokens first (`store.saveTokens` if they changed), then fetches each
     resource with `Promise.allSettled` so one failure doesn't blank the other widget, and
     writes each with `store.replaceItems(accountId, kind, groupKey, items)`. Re-throw the
     first rejection at the end so the account is marked `error`.
   - `revoke` revokes at the provider. If the provider has no revocation endpoint, throw —
     the UI then links the user to their account settings page.

5. **Wire it up**
   - `src/main/index.ts`: add to the `adapters` map.
   - `src/main/ipc.ts`: add to the `PROVIDERS` allowlist (it gates `connect`).
   - `src/main/env.ts` and `apps/desktop/.env.example`: add `MAIN_VITE_<PROVIDER>_*`.

6. **UI**
   - `pages/Settings.tsx`: `PROVIDERS` and `REVOKE_PAGES`.
   - `components/ProviderIcon.tsx`: `MARKS`.
   - `widgets/common.tsx`: `PROVIDER_NAMES`.
   - `RequireAccount` currently takes a single `provider`. If the new provider feeds an
     existing widget (Agenda, Inbox), generalize it to accept a list before the widget can
     show both.

7. **Docs** — add the setup steps to `README.md`, note the new secret/asset in
   `docs/security.md`, tick the roadmap item, add a CHANGELOG entry.

## Check

- `npm test && npm run typecheck && npm run lint`
- Connect end to end in the running app (`run-desktop-app`), then: restart (cached data
  loads), let a sync run, and disconnect (confirm the app disappears from the provider's
  connected-apps list).
- Revoke access at the provider's website and confirm the next sync shows **Reconnect**
  rather than a generic error — that verifies the `AuthRevokedError` path.
