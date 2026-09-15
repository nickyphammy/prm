import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { AccountSummary, ProviderId, Widget, WidgetType } from '@prm/shared'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useAccounts } from '@/lib/api'

export interface WidgetProps<T extends WidgetType> {
  widget: Extract<Widget, { type: T }>
  onConfigChange(config: Extract<Widget, { type: T }>['config']): void
  onRemove(): void
  onOpenSettings(): void
}

/** Current time, re-rendered every minute so "now" markers and past-event dimming stay accurate. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const PROVIDER_NAMES: Record<ProviderId, string> = { google: 'Google', notion: 'Notion' }

/**
 * Shows a connect prompt when no account exists for the provider, and a
 * reconnect banner above the (cached) content when an account lost access.
 */
export function RequireAccount({
  provider,
  onOpenSettings,
  children,
}: {
  provider: ProviderId
  onOpenSettings(): void
  children: ReactNode
}) {
  const { data: accounts } = useAccounts()
  if (!accounts) return null
  const mine = accounts.filter((a) => a.provider === provider)
  if (mine.length === 0) {
    return (
      <EmptyState
        title={`Connect ${PROVIDER_NAMES[provider]}`}
        description="Your data stays on this computer."
        action={
          <Button variant="primary" size="sm" onClick={onOpenSettings}>
            Open connections
          </Button>
        }
      />
    )
  }
  const broken = mine.filter((a: AccountSummary) => a.status !== 'connected')
  return (
    <>
      {broken.length > 0 && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 border-b border-border bg-warning/10 px-4 py-2 text-left text-xs text-warning hover:bg-warning/15"
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="truncate">
            {broken[0]!.status === 'needs_reauth'
              ? `${broken[0]!.label} needs to be reconnected`
              : `Couldn't sync ${broken[0]!.label}`}
          </span>
        </button>
      )}
      {children}
    </>
  )
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange(value: T): void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-surface-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={
            o.value === value
              ? 'rounded px-2 py-0.5 text-xs font-medium text-fg shadow-sm bg-surface'
              : 'rounded px-2 py-0.5 text-xs text-fg-muted hover:text-fg'
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
