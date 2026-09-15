import { useState } from 'react'
import { LayoutDashboard, RefreshCw, Settings as SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { syncNow, useAccounts, useSyncState } from '@/lib/api'
import { formatAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Dashboard } from '@/pages/Dashboard'
import { Settings } from '@/pages/Settings'
import { useNow } from '@/widgets/common'

type Page = 'dashboard' | 'settings'

const isMac = navigator.userAgent.includes('Mac')

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick(): void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm [&_svg]:size-4',
        active ? 'bg-surface-muted font-medium text-fg' : 'text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function SyncButton() {
  const { running, lastRunAt } = useSyncState()
  const { data: accounts } = useAccounts()
  useNow(30_000) // keep "synced x min ago" fresh
  if (!accounts?.length) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-subtle">
        {running ? 'Syncing…' : `Synced ${formatAgo(lastRunAt)}`}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sync now"
        title="Sync now"
        disabled={running}
        onClick={() => void syncNow()}
      >
        <RefreshCw className={cn(running && 'animate-spin')} />
      </Button>
    </div>
  )
}

export function App() {
  const [page, setPage] = useState<Page>('dashboard')
  return (
    <div className="flex h-full flex-col">
      <header
        className={cn(
          'app-drag flex h-12 shrink-0 items-center gap-1 border-b border-border pr-4',
          isMac ? 'pl-20' : 'pl-4',
        )}
      >
        <NavButton active={page === 'dashboard'} onClick={() => setPage('dashboard')}>
          <LayoutDashboard /> Dashboard
        </NavButton>
        <NavButton active={page === 'settings'} onClick={() => setPage('settings')}>
          <SettingsIcon /> Connections
        </NavButton>
        <div className="flex-1" />
        <SyncButton />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {page === 'dashboard' ? (
          <Dashboard onOpenSettings={() => setPage('settings')} />
        ) : (
          <Settings />
        )}
      </main>
    </div>
  )
}
