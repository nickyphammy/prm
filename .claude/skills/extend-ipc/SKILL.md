---
name: extend-ipc
description: Add or change a method on the PRM Dashboard IPC contract (window.api / DesktopApi) so the renderer can read new cached data or trigger a main-process action. Use when a widget or page needs data or an action that window.api doesn't expose yet, or when adding a main→renderer push event.
---

# Extend the IPC contract

The renderer's only door into the main process. Four files, in order — TypeScript fails the
build at each step you skip, so let `npm run typecheck` drive you.

Reference: `docs/development.md#add-an-ipc-method`, contract table in
`docs/architecture.md#ipc-contract`.

## Steps

1. **Contract** — `packages/shared/src/index.ts`: add the method to `DesktopApi`. Every
   method is async and maps 1:1 to an `ipcMain.handle` channel of the same name. Return
   `Result<T>` if the UI needs to display the failure message; plain values otherwise
   (a rejection becomes an opaque error).

2. **Handler** — `apps/desktop/src/main/ipc.ts`: implement it in the `handlers` object
   (typed as `Handlers`, so a missing method won't compile).
   - **Validate every argument** with `assert(...)`. Treat the renderer as untrusted.
   - **Never return tokens or raw provider responses.** Return normalized types.
   - Wrap fallible work in `toResult(...)`.
   - Anything network-bound that a user waits on should have a timeout (see
     `withTimeout` and `REVOKE_TIMEOUT_MS`).

3. **Bridge** — `apps/desktop/src/preload/index.ts`: add it to the `api` object as
   `invoke('methodName')`. No logic here, ever. Keep `preload/index.d.ts` in step.

4. **Hook** — `apps/desktop/src/renderer/src/lib/api.ts`: wrap it in a TanStack Query hook.
   - **Reads of cached data** get a key under the `DATA` (`['data', …]`) root, via
     `queryKeys`, so the main process's `data-updated` push invalidates them after each
     sync. Anything outside that root won't refresh on sync — that's deliberate for live
     lookups like `notionDataSources`.
   - **Mutations** use `useMutation` and invalidate what they affect in `onSettled`.
   - Unwrap `Result` in the hook (`if (!result.ok) throw new Error(result.error)`), so
     components only see data or an error.

## Push events (main → renderer)

For state the main process originates, add a channel to `IPC_EVENTS` in shared, broadcast
it via `broadcast()` in `main/index.ts`, expose an `on…(listener): () => void`
subscription in the preload that returns an unsubscribe function, and consume it either
in `subscribeToMainEvents` (to invalidate queries) or a small hook like `useSyncState`.

## Check

`npm test && npm run typecheck && npm run lint`. If the handler has real logic, put that
logic in a testable module outside `ipc.ts` — `ipc.ts` itself is untested Electron glue and
should stay thin. Then exercise the path in the running app (`run-desktop-app`).
