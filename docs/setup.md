# Setup and troubleshooting

This takes about 20 minutes. You need Node 22.12 or newer and npm 11, plus accounts on Google Cloud, Notion and Vercel.

```sh
npm install
cp apps/desktop/.env.example apps/desktop/.env
```

## 1. Google (Calendar + Gmail)

1. [Create a project](https://console.cloud.google.com/projectcreate) called `PRM Dashboard`, and make sure it's selected in the top bar.
2. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) and the [Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com).
3. In [Google Auth Platform → Overview](https://console.cloud.google.com/auth/overview), click **Get started**:
   - **App name:** PRM Dashboard
   - **Support email and contact email:** your email
   - **Audience:** **External**
4. Under [Audience → Test users](https://console.cloud.google.com/auth/audience), add every Google account you want to connect. Leave the publishing status on **Testing**.
5. Under [Data Access](https://console.cloud.google.com/auth/scopes) → **Add or remove scopes** → _Manually add scopes_, add these, then save:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/gmail.readonly
   ```
6. Under [Clients](https://console.cloud.google.com/auth/clients) → **Create client**, set **Application type** to **Desktop app**. Copy the client ID and secret right away, or download the JSON.
7. In `apps/desktop/.env`, set:
   ```
   MAIN_VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   MAIN_VITE_GOOGLE_CLIENT_SECRET=GOCSPX-…
   ```

## 2. Auth proxy (Vercel)

1. Create a Vercel project from the repo with **Root Directory** set to `apps/auth-proxy`, or deploy those files directly. No build settings are needed.
2. Deploy to **production** and note the stable URL, for example `https://prm-auth-proxy.vercel.app`.
3. In `apps/desktop/.env`, set `MAIN_VITE_AUTH_PROXY_URL` to that URL, with no trailing slash.

The production `*.vercel.app` alias must be publicly reachable. Vercel's deployment protection only covers per-deployment URLs by default, which is fine.

## 3. Notion

1. At [notion.so/profile/integrations](https://www.notion.so/profile/integrations), create a new connection:
   - **Authentication method:** **OAuth** (not Access token)
   - **Installable in:** 1 workspace is fine for personal use
   - **Redirect URI:** `https://<your proxy>/api/notion/callback`, matching exactly
2. Enable the **Read content** capability. Insert and update aren't needed.
3. Copy the **Client ID** and **Client secret**.
4. In Vercel → project → **Settings → Environment Variables**, add these for **Production**:
   - `NOTION_CLIENT_ID`
   - `NOTION_CLIENT_SECRET`
   - `NOTION_REDIRECT_URI` = the redirect URI above
5. **Redeploy** the proxy. Environment variable changes only apply to new deployments.
6. In `apps/desktop/.env`, set `MAIN_VITE_NOTION_CLIENT_ID`.

## 4. Run and connect

```sh
npm run dev
```

1. Go to **Connections → Google → Connect**.
   - Pick a test user and click **Continue** on "Google hasn't verified this app".
   - Check **both** Calendar and Gmail.
2. Go to **Connections → Notion → Connect**, and choose the pages and databases the dashboard may read.
3. On the Dashboard, pick a database in the Notion widget's dropdown, or keep **Recent pages**.

If macOS asks for keychain access for "PRM Dashboard Safe Storage", choose **Always Allow**.

## Troubleshooting

| Symptom                                                                  | Cause and fix                                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAIN_VITE_… is not set`                                                 | Missing value in `apps/desktop/.env`. Values are read at startup, so **restart `npm run dev`** after editing.                                                                                                     |
| `npm run dev` exits right away                                           | Another copy of the app is already running (single-instance lock). Quit it first, or launch with `--user-data-dir=<folder>` for a separate profile.                                                               |
| Notion: `HTTP 401 … {"error":"invalid_client"}`                          | Vercel's `NOTION_CLIENT_ID` or `NOTION_CLIENT_SECRET` doesn't match Notion. A common mistake is pasting something other than the client secret. Regenerate the secret in Notion, update Vercel, and **redeploy**. |
| Notion: `server_misconfigured`                                           | The env vars aren't set for the **Production** environment, or the proxy wasn't redeployed after adding them.                                                                                                     |
| Notion: redirect URI error on Notion's page                              | The redirect URI in Notion must exactly equal `<MAIN_VITE_AUTH_PROXY_URL>/api/notion/callback`.                                                                                                                   |
| Notion widget is empty                                                   | Only pages you shared are visible. Reconnect and select more pages, or in Notion open the page → `•••` → **Connections** → add PRM Dashboard.                                                                     |
| `fetch failed (ECONNRESET: …)` or similar on an account                  | Network problem between your computer and the provider. Click ↻ to retry. The part in parentheses is the underlying cause.                                                                                        |
| Google: "Please allow access to both Google Calendar and Gmail"          | A scope checkbox was left unchecked on the consent screen. Connect again and check both.                                                                                                                          |
| Google: `Error 403: access_denied`                                       | The account isn't listed under **Audience → Test users**.                                                                                                                                                         |
| Google: "Access expired — reconnect" about once a week                   | Expected while the consent screen is in **Testing** (7-day refresh tokens). Click **Reconnect**.                                                                                                                  |
| "PRM Dashboard needs access to your keychain" at startup                 | Keychain access was denied. Click **Try Again** and choose **Always Allow**. If no prompt appears, quit and reopen.                                                                                               |
| Account shows "Saved credentials could not be read"                      | The keychain entry was reset, for example after a macOS reinstall or a copy to a new computer. Click **Reconnect**.                                                                                               |
| Packaged app is killed instantly (`Code Signature Invalid` crash report) | The binary was modified after signing. Rebuild with `npm run build:mac -w apps/desktop` and don't edit the `.app` afterward. Keep `mac.identity` set, not `null`.                                                 |
