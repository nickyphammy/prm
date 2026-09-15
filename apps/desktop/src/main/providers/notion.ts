import {
  APIErrorCode,
  Client,
  isFullDataSource,
  isFullPage,
  isNotionClientError,
  type DataSourceObjectResponse,
  type PageObjectResponse,
} from '@notionhq/client'
import type { NotionDataSourceOption, NotionItem } from '@prm/shared'
import { AuthRevokedError } from '../errors'

const MAX_ITEMS = 50

type RichText = Array<{ plain_text: string }>
type PageProperty = PageObjectResponse['properties'][string]

const plain = (rich: RichText): string =>
  rich
    .map((t) => t.plain_text)
    .join('')
    .trim()

function iconOf(
  icon: PageObjectResponse['icon'] | DataSourceObjectResponse['icon'],
): string | null {
  if (!icon) return null
  if (icon.type === 'emoji') return icon.emoji
  if (icon.type === 'external') return icon.external.url
  if (icon.type === 'file') return icon.file.url
  return null
}

function dateOf(prop: PageProperty): number | null {
  if (prop.type !== 'date' || !prop.date) return null
  const start = prop.date.start
  // Date-only values ("2026-09-15") are calendar days, so pin them to local midnight like all-day events.
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    const [y, m, d] = start.split('-').map(Number)
    return new Date(y!, m! - 1, d!).getTime()
  }
  return Date.parse(start)
}

/**
 * Databases have arbitrary schemas; pick the title property, the first status
 * (or select) property, and the first date property.
 */
export function mapNotionPage(
  page: PageObjectResponse,
  accountId: string,
  dataSourceId: string | null,
): NotionItem {
  const props = Object.values(page.properties)
  const title = props.find((p) => p.type === 'title')
  const status = props.find((p) => p.type === 'status') ?? props.find((p) => p.type === 'select')
  const date = props.find((p) => p.type === 'date')

  let statusName: string | null = null
  if (status?.type === 'status') statusName = status.status?.name ?? null
  if (status?.type === 'select') statusName = status.select?.name ?? null

  return {
    kind: 'notion',
    id: page.id,
    accountId,
    dataSourceId,
    title: (title?.type === 'title' && plain(title.title)) || 'Untitled',
    status: statusName,
    date: date ? dateOf(date) : null,
    editedAt: Date.parse(page.last_edited_time),
    url: page.url,
    icon: iconOf(page.icon),
  }
}

export function createNotionClient(accessToken: string): Client {
  return new Client({ auth: accessToken })
}

/** Translate Notion's auth failures into the error sync uses to flag "needs reconnect". */
async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (isNotionClientError(err) && err.code === APIErrorCode.Unauthorized)
      throw new AuthRevokedError()
    throw err
  }
}

/** Data sources (databases) the user shared with the integration during OAuth. */
export function listDataSources(client: Client): Promise<NotionDataSourceOption[]> {
  return guard(async () => {
    const res = await client.search({
      filter: { property: 'object', value: 'data_source' },
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: 100,
    })
    return res.results.filter(isFullDataSource).map((ds) => ({
      id: ds.id,
      title: plain(ds.title) || 'Untitled database',
    }))
  })
}

export function fetchDataSourceItems(
  client: Client,
  accountId: string,
  dataSourceId: string,
): Promise<NotionItem[]> {
  return guard(async () => {
    const res = await client.dataSources.query({
      data_source_id: dataSourceId,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: MAX_ITEMS,
    })
    return res.results.filter(isFullPage).map((p) => mapNotionPage(p, accountId, dataSourceId))
  })
}

export function fetchRecentPages(client: Client, accountId: string): Promise<NotionItem[]> {
  return guard(async () => {
    const res = await client.search({
      filter: { property: 'object', value: 'page' },
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: 20,
    })
    return res.results.filter(isFullPage).map((p) => mapNotionPage(p, accountId, null))
  })
}
