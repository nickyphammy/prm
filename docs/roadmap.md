# Roadmap

A living list, grouped by stage. Items are suggestions until someone picks them up. Move finished work into the [changelog](../CHANGELOG.md).

## Now: personal use

- [x] Dashboard grid with Agenda, Inbox and Notion widgets
- [x] Google and Notion OAuth, background sync, offline cache
- [x] Security hardening: encrypted cache, token revocation, Electron fuses, proxy rate limiting
- [ ] Connect Google Calendar and Gmail on the maintainer's machine
- [ ] Connect the auth proxy to Git so pushes redeploy it ([release guide](release.md#auth-proxy-vercel))

## Next: product polish

- [ ] **Outlook (Microsoft Graph):** mail and calendar ([how to add a provider](development.md#add-a-provider))
- [ ] **More widgets:** next meeting, today's tasks (Notion status filter), multiple calendars side by side
- [ ] **Widget settings:** choose which calendars or labels to show, Notion filters and sorts
- [ ] **Sync settings:** interval, pause sync, a per-account "sync now"
- [ ] **Theme:** manual light, dark or system choice
- [ ] **Menu bar or tray:** quick glance at the next event and unread count
- [ ] **Onboarding:** first-run walkthrough instead of empty widgets
- [ ] **UI tests:** Playwright for Electron, or screenshot checks via the DevTools protocol

## Later: features to explore

- [ ] **Light actions:** mark email read, create events, check off Notion tasks. Needs write scopes ([ADR-008](decisions.md#adr-008-read-only-scopes-for-the-mvp)).
- [ ] **AI daily briefing:** a summary across calendar, inbox and Notion using the Claude API. Make it opt-in, and be explicit about what data leaves the device.
- [ ] **Search:** across cached items. Items are encrypted, so this needs an in-memory index built at startup.
- [ ] **Keyboard shortcuts and command palette**

## Before selling

- [ ] **Google verification:**
  - Privacy policy and terms of service pages, plus a homepage.
  - OAuth verification for the restricted `gmail.readonly` scope, including the demo video.
  - Confirm whether a CASA security assessment is required for a local-only app.
- [ ] **Notion:** switch the connection to allow any workspace, and fill in the public listing details.
- [ ] **Apple:** Developer ID signing and notarization; Windows code signing.
- [ ] **Auto-updates:** `electron-updater` with GitHub Releases.
- [ ] **Licensing and payments:** for example Lemon Squeezy or Keygen license keys, validated through the auth proxy.
- [ ] **Branding:** app icon and name check. Replace the lettermark provider icons, and follow Google's and Notion's brand guidelines.
- [ ] **Hard proxy rate limit:** a Vercel Firewall rule on `/api/notion/*`.
- [ ] **Crash reporting:** opt-in, with no personal content in reports.
- [ ] **Support:** docs site or help page, contact email.
- [ ] **Legal:** data handling statement matching the local-first architecture.
