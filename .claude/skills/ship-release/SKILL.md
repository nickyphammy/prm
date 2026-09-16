---
name: ship-release
description: Prepare and ship a PRM Dashboard release — version bump, changelog, auth-proxy deploy and verification, macOS/Windows build, signing, notarization, fuse checks and tagging. Use when asked to release, cut a version, build a DMG/installer for distribution, deploy the auth proxy, or set up signing or auto-updates.
---

# Ship a release

Reference: `docs/release.md` (full commands and the checklist this skill follows).

## Before anything outward-facing, confirm with the user

Deploying the proxy, pushing tags, publishing a GitHub Release and notarizing are all
visible to others or hard to undo. Prepare everything locally, show what will happen, and
get a go-ahead for each of those steps.

## 1. Gate

```sh
npm test && npm run typecheck && npm run lint && npm audit
```

Stop on any failure. `npm audit` findings in dev-only build tooling can be triaged; findings
in anything bundled into `out/` or the proxy cannot.

## 2. Version and changelog

- Bump `version` in `apps/desktop/package.json` (semver). This is the only version source;
  it drives the build output folder `apps/desktop/release/<version>/`.
- In `CHANGELOG.md`, move Unreleased items under a new `## [x.y.z] - YYYY-MM-DD` heading,
  grouped as Added / Changed / Fixed / Security.
- Tick completed items in `docs/roadmap.md`.

## 3. Auth proxy

Only if `apps/auth-proxy` changed since the last deploy. The Vercel project is **not
linked to Git** yet, so a push does not deploy it — use `npx vercel --prod` from
`apps/auth-proxy` (after `npx vercel link` once), or link the repo first.

Then run the three curl checks in `docs/release.md#verify-a-deployment`. Don't loop them:
the proxy's 20-requests-per-10-minutes limit applies to you too. Env var changes only apply
to a **new** deployment.

## 4. Build

```sh
npm run build:mac -w apps/desktop    # .dmg
npm run build:win -w apps/desktop    # NSIS; build on Windows or CI
```

`MAIN_VITE_*` values are compiled in from `apps/desktop/.env` at build time — confirm it
points at the **production** proxy URL, not `localhost:3000`.

## 5. Sign and verify

Local builds are ad-hoc signed (`mac.identity: '-'` in `electron-builder.yml`) and will be
blocked by Gatekeeper on other Macs. **Do not distribute an ad-hoc build.** Distribution
needs a Developer ID certificate and notarization — see `docs/release.md#signing-and-notarization-macos`.
Never commit Apple credentials; they come from the environment.

```sh
APP="apps/desktop/release/<version>/mac-arm64/PRM Dashboard.app"
codesign --verify --deep --strict "$APP"
spctl --assess --type execute -v "$APP"
npx @electron/fuses read --app "$APP"
```

Fuses must show RunAsNode, NODE_OPTIONS and CLI inspect **off**, ASAR integrity and
only-load-from-ASAR **on** (ADR-007).

## 6. Smoke tests

In a fresh isolated profile (see `run-desktop-app`, but **without** `--use-mock-keychain`
so the real keychain path is exercised):

- Clean install: connect Google and Notion, sync, restart (data loads from cache),
  disconnect (access actually revoked at the provider).
- Upgrade: install over the previous version; migrations run and accounts stay connected.

## 7. Tag and publish (confirm first)

```sh
git tag v<version> && git push --tags
```

Attach the signed artifacts to a GitHub Release.

## Not built yet

Auto-updates (`electron-updater` + GitHub Releases) are planned but absent. When adding
them, updates must be signed and verified — see `docs/security.md` known limitation 7.
