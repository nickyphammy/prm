# Changelog

Notable changes to PRM Dashboard. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `docs/` folder: architecture, auth flows, data and sync, security, setup and troubleshooting, development, release, design decisions, roadmap.

## [0.1.0] - 2026-09-15

Not yet distributed.

### Added

- Electron desktop app (Vite, React, TypeScript, Tailwind) with a draggable, resizable widget grid.
- **Agenda** widget: Google Calendar events for today, 3, 7 or 14 days; multi-day and all-day events; current-event highlight.
- **Inbox** widget: Gmail inbox with Unread, Important and All filters.
- **Notion** widget: recent pages, or any shared database with status and date.
- Google OAuth (desktop client, PKCE, loopback redirect) with automatic token refresh.
- Notion OAuth through a stateless Vercel auth proxy (`apps/auth-proxy`).
- Background sync every 5 minutes and on window focus, with per-account status and reconnect prompts.
- Local SQLite cache, so the dashboard loads instantly and works offline.
- Connections page: connect, cancel, reconnect, disconnect.
- Unit tests for mappers, OAuth, store, sync and proxy.

### Security

- Tokens encrypted with the OS keychain (`safeStorage`). The renderer is sandboxed, with a strict CSP and validated IPC.
- Cached emails, events and Notion items encrypted with AES-256-GCM. Migration v2 purges the earlier plaintext cache.
- Disconnect revokes access at Google and Notion.
- Electron fuses enabled; renderer served from `app://` instead of `file://`; local builds ad-hoc signed.
- Dialog explaining keychain access when it's denied at startup.
- Auth proxy rate-limited per IP. Credential diagnostics logging removed.

### Fixed

- Network errors now include their underlying cause (for example `ECONNRESET`) instead of a bare "fetch failed".
- Unreadable stored credentials mark the account for reconnect instead of aborting the whole sync.
