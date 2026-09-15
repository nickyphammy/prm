import type { ReactNode } from 'react'
import { GripVertical, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const DRAG_HANDLE_CLASS = 'widget-drag-handle'

export function WidgetFrame({
  title,
  icon,
  actions,
  onRemove,
  children,
}: {
  title: string
  icon: ReactNode
  actions?: ReactNode
  onRemove(): void
  children: ReactNode
}) {
  return (
    <section className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border pr-2 pl-1">
        <span
          className={`${DRAG_HANDLE_CLASS} flex cursor-grab items-center self-stretch px-1 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing`}
          title="Drag to move"
        >
          <GripVertical className="size-4" />
        </span>
        <span className="text-fg-muted [&_svg]:size-4">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
        {actions}
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${title} widget`}
          title="Remove widget"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onRemove}
        >
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}

/** Loading / error / needs-account placeholders shared by all widgets. */
export function WidgetStatus({ state, message }: { state: 'loading' | 'error'; message?: string }) {
  if (state === 'loading') {
    return (
      <div className="space-y-3 p-4" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-surface-muted" />
        ))}
      </div>
    )
  }
  return <p className="p-4 text-xs text-danger">{message ?? 'Something went wrong.'}</p>
}
