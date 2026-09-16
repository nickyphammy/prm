---
name: run-desktop-app
description: Launch PRM Dashboard (Electron) to see a change working — dev mode with hot reload, a packaged build in an isolated profile, or remote-debugged for screenshots and console inspection. Use when asked to run, start, open, screenshot or manually verify the app, or to check a UI change, since the UI has no automated tests.
---

# Run and verify the desktop app

The renderer has **no automated UI tests yet**, so any UI or IPC change needs a look in the
real app before it's called done. Reference: `docs/development.md#run-and-debug`.

## Dev mode

```sh
npm run dev          # from the repo root
```

- Only the **renderer** hot-reloads. Changes to `src/main`, `src/preload` or
  `apps/desktop/.env` need the dev process restarted.
- Main-process logs (sync failures with their `cause`, OAuth errors) print in the terminal
  running `npm run dev`. Run it in the background and read its output.
- Renderer DevTools: **View → Toggle Developer Tools** (⌥⌘I).
- Needs `apps/desktop/.env` filled in (`docs/setup.md`). Without credentials the app still
  starts; connecting fails with a clear message.

## Screenshots and console via DevTools protocol

```sh
cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9222
```

Then `curl -s http://127.0.0.1:9222/json` lists targets; connect to the page's
`webSocketDebuggerUrl` with any CDP client to take screenshots
(`Page.captureScreenshot`), read console output, or evaluate expressions. `window.api` is
available in the page for poking at IPC.

## Packaged build, isolated from real data

Use this to test packaging, fuses, the `app://` protocol or migrations without touching the
user's real accounts or the running dev app:

```sh
npm run build:unpack -w apps/desktop
"apps/desktop/release/<version>/mac-arm64/PRM Dashboard.app/Contents/MacOS/PRM Dashboard" \
  --user-data-dir=/tmp/prm-test --use-mock-keychain --remote-debugging-port=9333
```

- `--user-data-dir` gives it its own database and single-instance lock.
- `--use-mock-keychain` avoids macOS keychain prompts. **Never use it with real data** —
  it defeats the keychain protection on tokens.
- Use a scratch directory for the profile rather than a shared `/tmp` path when one is
  available, and delete it afterwards.

## What to check

Pick the ones the change touches:

- **Widgets:** add, drag, resize, change settings, remove; restart and confirm the layout
  persisted. Check light and dark mode (follows the OS).
- **Empty and error states:** with no account connected (connect prompt), and with an
  account in `needs_reauth` (reconnect banner above cached data).
- **Sync:** the header sync indicator runs, and data refreshes afterwards.
- **Offline:** disconnect the network — cached data still shows and sync errors appear on
  the Connections page rather than blanking widgets.
- **Links:** clicking an item opens the system browser, never navigates the app window.

## Reset

Real profile data: `~/Library/Application Support/PRM Dashboard/prm.db`. Ask before
deleting it — it holds the user's connected accounts, and reconnecting Google means going
through consent again.
