import { NotebookText } from 'lucide-react'
import type { NotionItem } from '@prm/shared'
import { EmptyState } from '@/components/EmptyState'
import { openExternal, useAccounts, useNotionDataSources, useNotionItems } from '@/lib/api'
import { formatRelativeShort } from '@/lib/format'
import { RequireAccount, useNow, type WidgetProps } from './common'
import { WidgetFrame, WidgetStatus } from './WidgetFrame'

function ItemIcon({ icon }: { icon: string | null }) {
  if (!icon) return <NotebookText className="size-4 text-fg-subtle" />
  if (icon.startsWith('https://'))
    return <img src={icon} alt="" className="size-4 rounded-sm object-cover" />
  return <span className="text-sm leading-none">{icon}</span>
}

function NotionList({ dataSourceId }: { dataSourceId: string | null }) {
  const now = useNow()
  const { data, isPending, error } = useNotionItems(dataSourceId)
  if (isPending) return <WidgetStatus state="loading" />
  if (error) return <WidgetStatus state="error" message={error.message} />
  if (data.length === 0) {
    return (
      <EmptyState
        title={dataSourceId ? 'No items yet' : 'No pages found'}
        description={
          dataSourceId
            ? 'Items appear here after the next sync.'
            : 'Only pages you shared with PRM Dashboard during connection are visible.'
        }
      />
    )
  }
  return (
    <ul className="p-2">
      {data.map((item: NotionItem) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => openExternal(item.url)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-muted"
          >
            <span className="grid size-5 shrink-0 place-items-center">
              <ItemIcon icon={item.icon} />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {item.status && (
              <span className="max-w-24 shrink-0 truncate rounded bg-surface-muted px-1.5 py-0.5 text-xs text-fg-muted">
                {item.status}
              </span>
            )}
            <span className="shrink-0 text-xs text-fg-subtle">
              {formatRelativeShort(item.date ?? item.editedAt, now)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function DataSourcePicker({
  value,
  onChange,
}: {
  value: string | null
  onChange(id: string | null): void
}) {
  const { data: accounts } = useAccounts()
  const connected = accounts?.some((a) => a.provider === 'notion') ?? false
  const { data: sources } = useNotionDataSources(connected)
  if (!connected) return null
  return (
    <select
      aria-label="Notion database"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-7 max-w-40 truncate rounded-md border border-border bg-surface px-1.5 text-xs text-fg"
    >
      <option value="">Recent pages</option>
      {sources?.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </select>
  )
}

export function NotionWidget({
  widget,
  onConfigChange,
  onRemove,
  onOpenSettings,
}: WidgetProps<'notion'>) {
  return (
    <WidgetFrame
      title="Notion"
      icon={<NotebookText />}
      onRemove={onRemove}
      actions={
        <DataSourcePicker
          value={widget.config.dataSourceId}
          onChange={(dataSourceId) => onConfigChange({ dataSourceId })}
        />
      }
    >
      <RequireAccount provider="notion" onOpenSettings={onOpenSettings}>
        <NotionList dataSourceId={widget.config.dataSourceId} />
      </RequireAccount>
    </WidgetFrame>
  )
}
