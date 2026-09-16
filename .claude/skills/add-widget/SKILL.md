---
name: add-widget
description: Add or change a dashboard widget in PRM Dashboard (next meeting, tasks, multiple calendars, per-widget settings…). Use when asked to add a widget, add a card/panel to the dashboard, or change what a widget shows or how it is configured.
---

# Add a widget

Widgets are pure renderer code. They read cached data through TanStack Query hooks and
never call a provider. If the data you need isn't cached yet, extend the provider's fetcher
first, then `extend-ipc`, then come back here.

Reference: `docs/development.md#add-a-widget`. Copy the shape of `AgendaWidget.tsx`, which
shows the full pattern: a `SegmentedControl` in the `WidgetFrame` header for config,
`RequireAccount`, `EmptyState`, `useNow` and `openExternal`.

## Steps

1. **Type** — `packages/shared/src/index.ts`: add the name to `WidgetType` and its config
   to `WidgetConfigMap`. The `Widget` union and every registry entry are derived from these,
   so `npm run typecheck` will now point at each remaining step.

2. **Component** — `src/renderer/src/widgets/<Name>Widget.tsx`:
   - Props are `WidgetProps<'<name>'>`: `widget`, `onConfigChange`, `onRemove`,
     `onOpenSettings`.
   - Wrap content in `<WidgetFrame>`. If it needs an account, also wrap it in
     `<RequireAccount>` (pass `provider` and `onOpenSettings`) so the connect and reconnect
     states come for free. Config controls go in the frame's header slot.
   - Read data with hooks from `lib/api.ts`. Use `WidgetStatus` for loading and error
     states and `<EmptyState>` when there's nothing to show.
   - Config changes call `onConfigChange` — persistence is handled by the dashboard.

3. **Register** — `widgets/registry.tsx`: add a `WIDGETS` entry with `title`,
   `description`, `icon` (lucide), `component` and `create()` returning the default config
   and grid size. The **Add widget** menu picks it up automatically. Grid is 12 columns,
   40 px rows; existing widgets are `w: 4, h: 9`.

4. **Test** — put any non-trivial grouping, filtering or date logic in
   `renderer/src/lib/` as a pure function with a `*.test.ts`, like `lib/agenda.ts`. The
   component itself isn't unit-tested; verify it in the app.

## Watch for

- **Rendering provider content is the main attack surface.** Use JSX text interpolation
  only. No `dangerouslySetInnerHTML`, no building HTML strings. Long subjects and titles
  get `truncate`.
- **Links** go through `openExternal` from `lib/api.ts` (https only), never `<a href>` that
  would navigate the window.
- **Time display** uses `useNow()` from `widgets/common.tsx` so "now" markers stay accurate
  without a per-widget timer.
- **New default widgets** only reach existing users if `DEFAULT_WIDGETS` in `main/store.ts`
  changes — and that list is used only before a user has ever saved a layout. Existing
  users must add the widget themselves.
- **Notion data sources** are fetched only when a widget references them
  (`store.notionDataSourceIds()`); saving a widget with a new data source triggers a sync.
  Keep that link intact if you change the Notion widget's config.

## Check

`npm test && npm run typecheck && npm run lint`, then add the widget in the running app
(`run-desktop-app`): drag, resize, change its settings, remove it, and restart to confirm
the layout persisted. Check both light and dark (they follow the OS setting).
