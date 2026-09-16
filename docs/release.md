# Release guide

## Auth proxy (Vercel)

**Current state:** the `prm-auth-proxy` project was deployed by uploading files directly. It isn't linked to the GitHub repo, so **pushing to `main` doesn't redeploy it**.

### Option A: connect Git (recommended)

1. In Vercel → **prm-auth-proxy → Settings → Git**, connect `nickyphammy/prm`.
2. Set **Root Directory** to `apps/auth-proxy`. Framework preset: **Other**, with no build command.
3. Every push to `main` then deploys to production, and every other branch gets a preview.

### Option B: CLI

```sh
cd apps/auth-proxy
npx vercel link     # once: choose the prm-auth-proxy project
npx vercel --prod
```

### After changing environment variables

Vercel only applies env var changes to **new** deployments, so redeploy (Deployments → ⋯ → Redeploy).

### Verify a deployment

```sh
# Callback rejects a bad state → 400
curl -s -o /dev/null -w "%{http_code}\n" "https://prm-auth-proxy.vercel.app/api/notion/callback?state=nope"

# Token endpoint with a fake code:
#   {"error":"invalid_request"} or invalid_grant → credentials OK
#   {"error":"invalid_client"}                   → NOTION_CLIENT_ID / SECRET wrong
#   {"error":"server_misconfigured"}             → env vars missing in Production
curl -s -X POST -H 'Content-Type: application/json' -d '{"code":"fake"}' \
  https://prm-auth-proxy.vercel.app/api/notion/token

# Revoke endpoint validates input → 400
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  https://prm-auth-proxy.vercel.app/api/notion/revoke
```

Don't hammer these endpoints: the per-IP rate limit (20 per 10 minutes) also applies to your own connections.

## Desktop app

### Build

```sh
npm run build:mac -w apps/desktop      # .dmg in apps/desktop/release/<version>/
npm run build:win -w apps/desktop      # NSIS installer (build on Windows or CI)
npm run build:unpack -w apps/desktop   # .app folder only, quickest to test
```

- **Where values come from:** `MAIN_VITE_*` values are compiled in from `apps/desktop/.env` at build time.
- **Version:** set by `version` in `apps/desktop/package.json`.
- **Native module:** `better-sqlite3` ships Node-API prebuilds for macOS, Windows and Linux on x64 and arm64, so no native rebuild runs (`npmRebuild: false`).

### Signing and notarization (macOS)

Local builds are **ad-hoc signed** (`mac.identity: '-'`). Enabling Electron fuses rewrites the binary, and macOS kills binaries with an invalid signature. Ad-hoc builds run on your own Mac but will be blocked by Gatekeeper on other people's.

To distribute:

1. **Get a certificate:** join the Apple Developer Program and install a **Developer ID Application** certificate in your keychain.
2. **Configure signing:** in `electron-builder.yml`, replace `identity: '-'` with the certificate name, or remove the line to let electron-builder find it. Keep the hardened runtime on.
3. **Enable notarization:** set it in the `mac` config and provide Apple credentials in the environment. For example, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`, or an App Store Connect API key. Check the current electron-builder notarization docs for the exact option names.
4. **Check entitlements:** Electron apps with the hardened runtime usually need JIT-related entitlements. The build warns if library validation would block native modules. Test the notarized build on a second Mac.
5. **Verify:**
   ```sh
   codesign --verify --deep --strict "PRM Dashboard.app"
   spctl --assess --type execute -v "PRM Dashboard.app"
   npx @electron/fuses read --app "PRM Dashboard.app"
   ```

### Windows

- **Signing:** get a code-signing certificate (for example Azure Trusted Signing) and configure `win.signtoolOptions` or the Azure signing options. Unsigned installers trigger SmartScreen warnings.
- **Testing:** `safeStorage` uses DPAPI on Windows. Test connect, sync and restart on a real Windows machine.

### Auto-updates (not yet implemented)

Planned: `electron-updater` publishing to GitHub Releases. Updates must be signed. On macOS, auto-update only works for signed apps.

## Release checklist

- [ ] `npm test`, `npm run typecheck`, `npm run lint` and `npm audit` all pass
- [ ] Bump `version` in `apps/desktop/package.json`
- [ ] Update `CHANGELOG.md` (move items from Unreleased)
- [ ] Proxy deployed and verified with the curl checks above
- [ ] Build signed and notarized; `codesign`, `spctl` and fuse checks pass
- [ ] Clean-install smoke test in a fresh profile: connect Google and Notion, sync, restart (data loads from cache), disconnect (access revoked)
- [ ] Upgrade test: install over the previous version, confirm migrations run and accounts stay connected
- [ ] Tag the release (`git tag v0.x.y && git push --tags`) and attach the artifacts to a GitHub Release
