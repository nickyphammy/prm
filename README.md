# PRM Dashboard

A desktop dashboard for your Google Calendar, Gmail and Notion. Built with Electron, React and TypeScript.
Your data stays on your computer: tokens are encrypted with the OS keychain and cached items live in a local SQLite file.

```
apps/desktop      Electron app
  src/main        Node side: OAuth, provider API calls, sync scheduler, SQLite (owns every secret)
  src/preload     Typed, minimal bridge exposed to the UI as window.api
  src/renderer    React UI: dashboard grid, widgets, connections page
apps/auth-proxy   Two Vercel functions that hold the Notion client secret (stateless, stores nothing)
packages/shared   Types shared by main, preload and renderer (the IPC contract)
```

## How data flows

1. **Connect.** The main process starts a listener on `127.0.0.1` on a random port. It then opens your browser to the provider's consent screen.
   - Google redirects straight back to that listener (PKCE, desktop OAuth client).
   - Notion must redirect to a fixed HTTPS URL, so it goes to the auth proxy. The proxy bounces the browser back to the listener, and the app then asks the proxy to exchange the code using the client secret.
2. **Sync.** Sync runs every 5 minutes, when the window gains focus (if the data is more than a minute old), and on demand. Each provider adapter fetches fresh data and replaces its slice of the local cache. Then the renderer is told to re-read.
3. **Display.** Widgets only read from the local cache over IPC, so the dashboard works offline and loads instantly.
4. **Errors.**
   - If a provider revokes access, the account is marked **needs reconnect**. Cached data stays visible with a banner.
   - Any other failure shows on the Connections page, and the next sync retries.

## Setup

Requires Node 22.12 or newer and npm 11.

```sh
npm install
cp apps/desktop/.env.example apps/desktop/.env
```

### 1. Google (Gmail + Calendar)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. Under **APIs & Services → Library**, enable the **Gmail API** and the **Google Calendar API**.
3. Set up **OAuth consent screen**:
   - User type: **External**. Publishing status: leave it in **Testing**.
   - Add the scopes `calendar.readonly` and `gmail.readonly`.
   - Add your own Google address under **Test users**.
4. Go to **Credentials → Create credentials → OAuth client ID** and choose application type **Desktop app**.
5. Put the client ID and secret in `apps/desktop/.env` as `MAIN_VITE_GOOGLE_CLIENT_ID` and `MAIN_VITE_GOOGLE_CLIENT_SECRET`.

> While the app is in **Testing**, Google expires refresh tokens after 7 days. The app detects this and shows **Reconnect**; it only stops once the app is published and verified.

### 2. Notion auth proxy (Vercel)

1. Create a Vercel project from this repo with **Root Directory** set to `apps/auth-proxy`. No build settings are needed.
2. Deploy, and note the URL (for example `https://prm-auth-proxy.vercel.app`).
3. In `apps/desktop/.env`, set `MAIN_VITE_AUTH_PROXY_URL` to that URL.

For local testing, run `npx vercel dev` in `apps/auth-proxy` and use `http://localhost:3000`. This URL must then also be the redirect URI registered in Notion.

### 3. Notion

1. At [notion.so/profile/integrations](https://www.notion.so/profile/integrations), create a **Public** integration with the **Read content** capability.
2. Set the redirect URI to `<proxy URL>/api/notion/callback`.
3. On Vercel, add the environment variables `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET`, then redeploy.
   - Optional: set `NOTION_REDIRECT_URI` if the proxy is reachable at more than one URL.
4. In `apps/desktop/.env`, set `MAIN_VITE_NOTION_CLIENT_ID`.

When you connect, Notion asks which pages to share. The app can only see what you pick there.

## Commands

| Command                             | What it does                                |
| ----------------------------------- | ------------------------------------------- |
| `npm run dev`                       | Run the app with hot reload                 |
| `npm test`                          | Unit tests (Vitest)                         |
| `npm run typecheck`                 | Type-check every workspace                  |
| `npm run lint`                      | ESLint                                      |
| `npm run build:mac -w apps/desktop` | Build a `.dmg` into `apps/desktop/release/` |

Local data lives in `~/Library/Application Support/PRM Dashboard/prm.db` on macOS. Delete it to reset the app.

## Security model

- **Renderer:** runs with `sandbox`, `contextIsolation` and no Node integration, under a strict CSP. It can only call the typed methods in `packages/shared`.
  - Packaged builds serve the UI from `app://renderer` (`src/main/app-protocol.ts`), not `file://`.
- **Tokens:** encrypted with Electron `safeStorage` (OS keychain). They never cross IPC.
- **Cached data:** emails, events and Notion items are encrypted with AES-256-GCM (`src/main/data-cipher.ts`). The data key is itself wrapped by the keychain.
  - Deleted rows are zeroed (`secure_delete`).
  - Still plaintext: account labels (email address or workspace name), item IDs and timestamps.
- **Disconnect:** revokes access at Google, and at Notion via the proxy, before deleting local data. If revocation fails (for example offline), the UI links to the provider's settings page.
- **Electron fuses** (`electron-builder.yml`): these are off, so the packaged app ignores them:
  - `ELECTRON_RUN_AS_NODE`
  - `NODE_OPTIONS`
  - `--inspect`

  These are on:
  - ASAR integrity validation
  - Load app only from ASAR

  Local builds are ad-hoc signed, because flipping fuses rewrites the binary and invalidates Electron's original signature.

- **`openExternal`:** accepts only `https://` URLs.
- **Auth proxy:**
  - Forwards only token fields, dropping the owner's email and profile.
  - Redirects only to `127.0.0.1` and stores nothing.
  - Rate-limits each IP to 20 requests per 10 minutes. The limit is in memory per function instance; add a Vercel Firewall rule for a hard global limit.

## Before selling

- **Google verification.** `gmail.readonly` is a restricted scope, so a public release needs Google's OAuth verification (privacy policy, homepage, demo video). Because data stays on the device, check whether the CASA security assessment applies to you.
- **Code signing.** Replace the ad-hoc `mac.identity: '-'` in `electron-builder.yml` with an Apple Developer ID and add notarization. Windows needs a code-signing certificate.
- **Auto-updates.** `electron-updater` with GitHub Releases.
- **Licensing.** Lemon Squeezy or Keygen license keys, validated through the auth proxy.
- **Branding.** Replace the lettermark provider icons and add an app icon in `apps/desktop/build/`.
- **Proxy hardening.** Add a Vercel Firewall rate-limit rule on `/api/notion/*` to back up the in-memory limiter.
- **Outlook.** Microsoft Graph (Outlook mail and calendar) plugs in as another `ProviderAdapter` (`apps/desktop/src/main/providers/types.ts`).
