import { CalendarDays, MapPin } from 'lucide-react'
import type { NormalizedEvent } from '@prm/shared'
import { EmptyState } from '@/components/EmptyState'
import { openExternal, useEvents } from '@/lib/api'
import { groupByDay } from '@/lib/agenda'
import { DAY_MS, formatDayHeading, formatTime, startOfDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RequireAccount, SegmentedControl, useNow, type WidgetProps } from './common'
import { WidgetFrame, WidgetStatus } from './WidgetFrame'

const DAY_OPTIONS = [
  { value: '1', label: 'Today' },
  { value: '3', label: '3d' },
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
] as const

function EventRow({ event, now }: { event: NormalizedEvent; now: number }) {
  const past = event.end <= now
  const current = event.start <= now && now < event.end && !event.allDay
  return (
    <li>
      <button
        type="button"
        disabled={!event.url}
        onClick={() => event.url && openExternal(event.url)}
        className={cn(
          'flex w-full gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted disabled:hover:bg-transparent',
          past && 'opacity-50',
        )}
      >
        <span
          className="mt-1 h-8 w-1 shrink-0 rounded-full"
          style={{ background: event.color ?? 'var(--color-accent)' }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{event.title}</span>
          <span className="flex items-center gap-2 text-xs text-fg-muted">
            <span className={cn(current && 'font-medium text-accent')}>
              {event.allDay ? 'All day' : `${formatTime(event.start)} – ${formatTime(event.end)}`}
              {current && ' · now'}
            </span>
            {event.location && (
              <span className="flex min-w-0 items-center gap-0.5 truncate">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

function AgendaList({ days }: { days: number }) {
  const now = useNow()
  const from = startOfDay(now)
  const { data, isPending, error } = useEvents(from, from + days * DAY_MS)

  if (isPending) return <WidgetStatus state="loading" />
  if (error) return <WidgetStatus state="error" message={error.message} />
  const groups = groupByDay(data, from, days)
  if (groups.length === 0) {
    return (
      <EmptyState
        title="Nothing scheduled"
        description={days === 1 ? 'Your day is clear.' : `No events in the next ${days} days.`}
      />
    )
  }
  return (
    <div className="space-y-3 p-2">
      {groups.map(([day, events]) => (
        <div key={day}>
          <h3 className="sticky top-0 z-10 bg-surface px-2 py-1 text-xs font-semibold text-fg-muted uppercase">
            {formatDayHeading(day, now)}
          </h3>
          <ul>
            {events.map((e) => (
              <EventRow key={e.id} event={e} now={now} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function AgendaWidget({
  widget,
  onConfigChange,
  onRemove,
  onOpenSettings,
}: WidgetProps<'agenda'>) {
  return (
    <WidgetFrame
      title="Agenda"
      icon={<CalendarDays />}
      onRemove={onRemove}
      actions={
        <SegmentedControl
          label="Days shown"
          value={String(widget.config.days)}
          options={DAY_OPTIONS}
          onChange={(v) => onConfigChange({ days: Number(v) })}
        />
      }
    >
      <RequireAccount provider="google" onOpenSettings={onOpenSettings}>
        <AgendaList days={widget.config.days} />
      </RequireAccount>
    </WidgetFrame>
  )
}
