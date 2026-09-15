import type { Client } from '@notionhq/client'
import type { NotionDataSourceOption } from '@prm/shared'
import { env } from '../env'
import { AuthRevokedError } from '../errors'
import { startLoopback } from '../oauth/loopback'
import {
  buildNotionAuthUrl,
  encodeNotionState,
  exchangeNotionCode,
  refreshNotionTokens,
  type NotionTokens,
} from '../oauth/notion'
import { randomToken } from '../oauth/pkce'
import type { StoredAccount, Store } from '../store'
import {
  createNotionClient,
  fetchDataSourceItems,
  fetchRecentPages,
  listDataSources,
} from './notion'
import type { ProviderAdapter } from './types'

/**
 * Run `work` with the account's Notion client; on a 401, refresh the token
 * once through the auth proxy (if Notion issued a refresh token) and retry.
 */
export async function withNotionClient<T>(
  account: StoredAccount<NotionTokens>,
  store: Store,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  try {
    return await work(createNotionClient(account.tokens.accessToken))
  } catch (err) {
    if (!(err instanceof AuthRevokedError) || !account.tokens.refreshToken) throw err
    const refreshed = await refreshNotionTokens({
      proxyUrl: env.authProxyUrl(),
      refreshToken: account.tokens.refreshToken,
    })
    store.saveTokens(account.id, refreshed.tokens)
    account.tokens = refreshed.tokens
    return work(createNotionClient(refreshed.tokens.accessToken))
  }
}

export async function listAllDataSources(store: Store): Promise<NotionDataSourceOption[]> {
  const perAccount = await Promise.all(
    store.accountsFor('notion').map((summary) => {
      const account = store.getAccount<NotionTokens>(summary.id)
      return account ? withNotionClient(account, store, listDataSources) : []
    }),
  )
  return perAccount.flat()
}

export const notionAdapter: ProviderAdapter<NotionTokens> = {
  id: 'notion',

  async connect({ openBrowser, signal }) {
    const proxyUrl = env.authProxyUrl()
    const loopback = await startLoopback('/notion/callback', signal)
    try {
      const state = encodeNotionState(loopback.port, randomToken())
      await openBrowser(buildNotionAuthUrl({ clientId: env.notionClientId(), proxyUrl, state }))
      const params = await loopback.waitForCallback()
      if (params.get('error')) throw new Error(`Notion sign-in failed: ${params.get('error')}`)
      if (params.get('state') !== state)
        throw new Error('Sign-in response did not match the request.')

      const connection = await exchangeNotionCode({ proxyUrl, code: params.get('code') ?? '' })
      return {
        externalId: connection.workspaceId,
        label: connection.workspaceName,
        tokens: connection.tokens,
      }
    } finally {
      loopback.close()
    }
  },

  async sync({ account, store }) {
    await withNotionClient(account, store, async (client) => {
      store.replaceItems(account.id, 'notion', '', await fetchRecentPages(client, account.id))

      // Widgets store only a data source id, so check which ones this workspace can actually see.
      const wanted = new Set(store.notionDataSourceIds())
      const available = (await listDataSources(client)).filter((ds) => wanted.has(ds.id))
      for (const ds of available) {
        store.replaceItems(
          account.id,
          'notion',
          ds.id,
          await fetchDataSourceItems(client, account.id, ds.id),
        )
      }
      store.pruneGroups(account.id, 'notion', new Set(['', ...available.map((ds) => ds.id)]))
    })
  },
}
