import { useEffect, useRef, useState } from 'react'
import ReactGridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { Plus } from 'lucide-react'
import type { Widget, WidgetType } from '@prm/shared'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useSaveWidgets, useWidgets } from '@/lib/api'
import type { WidgetProps } from '@/widgets/common'
import { WIDGETS, WIDGET_TYPES } from '@/widgets/registry'
import { DRAG_HANDLE_CLASS } from '@/widgets/WidgetFrame'

const COLS = 12
const ROW_HEIGHT = 40

function AddWidgetMenu({ onAdd }: { onAdd(type: WidgetType): void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus /> Add widget
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          {WIDGET_TYPES.map((type) => (
            <button
              key={type}
              role="menuitem"
              type="button"
              onClick={() => {
                onAdd(type)
                setOpen(false)
              }}
              className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-surface-muted"
            >
              <span className="mt-0.5 text-fg-muted [&_svg]:size-4">{WIDGETS[type].icon}</span>
              <span>
                <span className="block text-sm font-medium">{WIDGETS[type].title}</span>
                <span className="block text-xs text-fg-muted">{WIDGETS[type].description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Dashboard({ onOpenSettings }: { onOpenSettings(): void }) {
  const { data: widgets } = useWidgets()
  const save = useSaveWidgets()
  // The container div must render on the first pass so the width hook can measure it.
  const { width, containerRef, mounted } = useContainerWidth()

  const update = (next: Widget[]) => save.mutate(next)

  const addWidget = (type: WidgetType) => {
    if (!widgets) return
    const { size, ...rest } = WIDGETS[type].create()
    const bottom = widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0)
    update([
      ...widgets,
      { ...rest, id: crypto.randomUUID(), layout: { x: 0, y: bottom, ...size } } as Widget,
    ])
  }

  const onLayoutChange = (layout: Layout) => {
    if (!widgets) return
    const byId = new Map(layout.map((l) => [l.i, l]))
    let changed = false
    const next = widgets.map((w) => {
      const l = byId.get(w.id)
      if (
        !l ||
        (l.x === w.layout.x && l.y === w.layout.y && l.w === w.layout.w && l.h === w.layout.h)
      )
        return w
      changed = true
      return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } }
    })
    if (changed) update(next)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-5 pb-1">
        <h1 className="text-lg font-semibold">
          {new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}
        </h1>
        <AddWidgetMenu onAdd={addWidget} />
      </div>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {!widgets ? null : widgets.length === 0 ? (
          <EmptyState title="Your dashboard is empty" description="Add a widget to get started." />
        ) : (
          mounted && (
            <ReactGridLayout
              width={width}
              layout={widgets.map((w) => ({ i: w.id, ...w.layout, minW: 3, minH: 4 }))}
              gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [12, 12] }}
              dragConfig={{ handle: `.${DRAG_HANDLE_CLASS}` }}
              onLayoutChange={onLayoutChange}
            >
              {widgets.map((widget) => {
                const Component = WIDGETS[widget.type].component as React.ComponentType<
                  WidgetProps<typeof widget.type>
                >
                return (
                  <div key={widget.id}>
                    <Component
                      widget={widget}
                      onOpenSettings={onOpenSettings}
                      onRemove={() => update(widgets.filter((w) => w.id !== widget.id))}
                      onConfigChange={(config) =>
                        update(
                          widgets.map((w) =>
                            w.id === widget.id ? ({ ...w, config } as Widget) : w,
                          ),
                        )
                      }
                    />
                  </div>
                )
              })}
            </ReactGridLayout>
          )
        )}
      </div>
    </div>
  )
}
