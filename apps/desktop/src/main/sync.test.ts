import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderId } from '@prm/shared'
import { openDb } from './db'
import { AuthRevokedError } from './errors'
import type { ProviderAdapter } from './providers/types'
import { Store, type TokenCodec } from './store'
import { SyncService } from './sync'

const codec: TokenCodec = {
  encrypt: (value) => Buffer.from(JSON.stringify(value)),
  decrypt: <T>(blob: Buffer) => JSON.parse(blob.toString()) as T,
}

function setup(sync: ProviderAdapter['sync']) {
  const store = new Store(openDb(':memory:'), codec)
  const adapter: ProviderAdapter = { id: 'google', connect: vi.fn(), sync: vi.fn(sync) }
  const events = { dataUpdated: vi.fn(), stateChanged: vi.fn() }
  const adapters = { google: adapter, notion: adapter } as Record<
    ProviderId,
    ProviderAdapter<never>
  >
  const service = new SyncService(store, adapters, events)
  const account = store.upsertAccount({
    provider: 'google',
    externalId: 's',
    label: 'me',
    tokens: { t: 1 },
  })
  return { store, adapter, events, service, account }
}

describe('SyncService', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('marks accounts synced and notifies the renderer', async () => {
    const { store, events, service, account } = setup(async () => {})
    await service.syncAll()
    expect(store.getAccount(account.id)).toMatchObject({ status: 'connected', lastError: null })
    expect(store.getAccount(account.id)!.lastSyncedAt).toBeGreaterThan(0)
    expect(events.dataUpdated).toHaveBeenCalledTimes(1)
    expect(service.state()).toMatchObject({ running: false })
  })

  it('flags revoked access as needs_reauth and stops retrying it', async () => {
    const { store, adapter, service, account } = setup(async () => {
      throw new AuthRevokedError()
    })
    await service.syncAll()
    expect(store.getAccount(account.id)?.status).toBe('needs_reauth')
    await service.syncAll()
    expect(adapter.sync).toHaveBeenCalledTimes(1)
  })

  it('records other failures without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, service, account } = setup(async () => {
      throw new Error('rate limited')
    })
    await expect(service.syncAll()).resolves.toBeUndefined()
    expect(store.getAccount(account.id)).toMatchObject({
      status: 'error',
      lastError: 'rate limited',
    })
  })

  it('asks for reconnect when stored credentials cannot be decrypted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { store, service, account } = setup(async () => {})
    // Simulate a keychain reset: decryption throws for this account.
    vi.spyOn(store, 'getAccount').mockImplementationOnce(() => {
      throw new Error('Error while decrypting the ciphertext')
    })
    await service.syncAll()
    expect(store.listAccounts().find((a) => a.id === account.id)?.status).toBe('needs_reauth')
  })

  it('shares one in-flight run between concurrent callers', async () => {
    let release!: () => void
    const { adapter, service } = setup(() => new Promise<void>((r) => (release = r)))
    const a = service.syncAll()
    const b = service.syncAll()
    expect(service.state().running).toBe(true)
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    release()
    await Promise.all([a, b])
    expect(adapter.sync).toHaveBeenCalledTimes(1)
  })
})

describe('errorMessage', () => {
  it('includes the network cause behind a bare "fetch failed"', async () => {
    const { errorMessage } = await import('./errors')
    const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    expect(errorMessage(new TypeError('fetch failed', { cause }))).toBe(
      'fetch failed (ECONNRESET: read ECONNRESET)',
    )
    expect(errorMessage('plain')).toBe('plain')
  })
})
