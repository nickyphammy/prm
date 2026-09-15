import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import type { AccountSummary, ProviderId } from '@prm/shared'
import { ProviderIcon } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { cancelConnect, useAccounts, useConnect, useDisconnect } from '@/lib/api'
import { formatAgo } from '@/lib/format'

const PROVIDERS: Array<{ id: ProviderId; name: string; description: string }> = [
  { id: 'google', name: 'Google', description: 'Gmail and Google Calendar (read-only)' },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Pages and databases you choose to share (read-only)',
  },
]

function AccountRow({ account, onReconnect }: { account: AccountSummary; onReconnect(): void }) {
  const disconnect = useDisconnect()
  return (
    <li className="flex items-center gap-3 py-2.5 pl-11">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{account.label}</p>
        {account.status === 'connected' ? (
          <p className="flex items-center gap-1 text-xs text-fg-muted">
            <CheckCircle2 className="size-3 text-accent" /> Synced {formatAgo(account.lastSyncedAt)}
          </p>
        ) : (
          <p className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="size-3 shrink-0" />
            <span className="truncate" title={account.lastError ?? undefined}>
              {account.status === 'needs_reauth'
                ? 'Access expired — reconnect to resume syncing'
                : account.lastError}
            </span>
          </p>
        )}
      </div>
      {account.status === 'needs_reauth' && (
        <Button size="sm" variant="primary" onClick={onReconnect}>
          Reconnect
        </Button>
      )}
      <Button
        size="sm"
        variant="danger"
        disabled={disconnect.isPending}
        onClick={() => {
          if (
            confirm(`Disconnect ${account.label}? Cached data from this account will be removed.`)
          ) {
            disconnect.mutate(account.id)
          }
        }}
      >
        Disconnect
      </Button>
    </li>
  )
}

function ProviderCard({
  provider,
  accounts,
}: {
  provider: (typeof PROVIDERS)[number]
  accounts: AccountSummary[]
}) {
  const connect = useConnect()
  const cancelled = connect.error?.message === 'Connection cancelled.'

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <ProviderIcon provider={provider.id} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{provider.name}</h2>
          <p className="text-xs text-fg-muted">{provider.description}</p>
        </div>
        {connect.isPending ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Loader2 className="size-3.5 animate-spin" /> Finish in your browser…
            </span>
            <Button size="sm" variant="ghost" onClick={() => void cancelConnect()}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant={accounts.length ? 'secondary' : 'primary'}
            onClick={() => connect.mutate(provider.id)}
          >
            {accounts.length ? 'Add account' : 'Connect'}
          </Button>
        )}
      </div>
      {connect.error && !cancelled && (
        <p className="mt-3 pl-11 text-xs text-danger">{connect.error.message}</p>
      )}
      {accounts.length > 0 && (
        <ul className="mt-2 divide-y divide-border border-t border-border">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} onReconnect={() => connect.mutate(provider.id)} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function Settings() {
  const { data: accounts = [] } = useAccounts()
  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <h1 className="text-lg font-semibold">Connections</h1>
      <p className="mt-1 mb-5 text-sm text-fg-muted">
        Sign-in happens in your browser. Tokens are encrypted with your system keychain and your
        data never leaves this computer.
      </p>
      <div className="space-y-3">
        {PROVIDERS.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            accounts={accounts.filter((a) => a.provider === p.id)}
          />
        ))}
      </div>
    </div>
  )
}
