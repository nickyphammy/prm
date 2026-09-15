import { Mail } from 'lucide-react'
import type { WidgetConfigMap } from '@prm/shared'
import { EmptyState } from '@/components/EmptyState'
import { openExternal, useEmails } from '@/lib/api'
import { formatRelativeShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import { RequireAccount, SegmentedControl, useNow, type WidgetProps } from './common'
import { WidgetFrame, WidgetStatus } from './WidgetFrame'

type Filter = WidgetConfigMap['inbox']['filter']

const FILTER_OPTIONS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'unread', label: 'Unread' },
  { value: 'important', label: 'Important' },
  { value: 'all', label: 'All' },
]

const EMPTY_COPY: Record<Filter, string> = {
  unread: 'No unread mail in your inbox.',
  important: 'Nothing marked important.',
  all: 'Your inbox is empty.',
}

function EmailList({ filter }: { filter: Filter }) {
  const now = useNow()
  const { data, isPending, error } = useEmails(filter)
  if (isPending) return <WidgetStatus state="loading" />
  if (error) return <WidgetStatus state="error" message={error.message} />
  if (data.length === 0)
    return <EmptyState title="All caught up" description={EMPTY_COPY[filter]} />
  return (
    <ul className="divide-y divide-border">
      {data.map((email) => (
        <li key={`${email.accountId}:${email.id}`}>
          <button
            type="button"
            onClick={() => openExternal(email.url)}
            className="block w-full px-4 py-2.5 text-left hover:bg-surface-muted"
          >
            <span className="flex items-baseline gap-2">
              {email.unread && (
                <span
                  className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-accent"
                  aria-label="Unread"
                />
              )}
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  email.unread ? 'font-semibold' : 'text-fg-muted',
                )}
              >
                {email.from}
              </span>
              <span className="shrink-0 text-xs text-fg-subtle">
                {formatRelativeShort(email.receivedAt, now)}
              </span>
            </span>
            <span className={cn('block truncate', email.unread ? 'font-medium' : 'text-fg-muted')}>
              {email.subject}
            </span>
            <span className="block truncate text-xs text-fg-subtle">{email.snippet}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function InboxWidget({
  widget,
  onConfigChange,
  onRemove,
  onOpenSettings,
}: WidgetProps<'inbox'>) {
  return (
    <WidgetFrame
      title="Inbox"
      icon={<Mail />}
      onRemove={onRemove}
      actions={
        <SegmentedControl
          label="Filter"
          value={widget.config.filter}
          options={FILTER_OPTIONS}
          onChange={(filter) => onConfigChange({ filter })}
        />
      }
    >
      <RequireAccount provider="google" onOpenSettings={onOpenSettings}>
        <EmailList filter={widget.config.filter} />
      </RequireAccount>
    </WidgetFrame>
  )
}
