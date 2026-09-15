import type { NormalizedEmail } from '@prm/shared'
import { fetchJson, mapWithConcurrency, type FetchFn } from '../http'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_MESSAGES = 50

export interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string
  payload?: { headers?: Array<{ name: string; value: string }> }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Gmail snippets arrive HTML-escaped. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

/** `"Ada Lovelace" <ada@example.com>` → `Ada Lovelace`; falls back to the address. */
export function displayName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (!match) return from.trim()
  return match[1]?.trim() || match[2]!.trim()
}

export function mapGmailMessage(
  raw: GmailMessage,
  accountId: string,
  accountEmail: string,
): NormalizedEmail {
  const header = (name: string): string =>
    raw.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  const labels = new Set(raw.labelIds ?? [])
  return {
    kind: 'email',
    id: raw.id,
    accountId,
    threadId: raw.threadId,
    from: displayName(header('From')) || '(Unknown sender)',
    subject: header('Subject').trim() || '(No subject)',
    snippet: decodeEntities(raw.snippet ?? ''),
    receivedAt: Number(raw.internalDate ?? Date.parse(header('Date'))),
    unread: labels.has('UNREAD'),
    important: labels.has('IMPORTANT'),
    url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}#all/${raw.threadId}`,
  }
}

/** Latest inbox messages. Widgets filter to unread/important locally so one sync serves all of them. */
export async function fetchInbox(
  accessToken: string,
  accountId: string,
  accountEmail: string,
  fetchFn: FetchFn = fetch,
): Promise<NormalizedEmail[]> {
  const list = await fetchJson<{ messages?: Array<{ id: string }> }>(
    `${API}/messages?labelIds=INBOX&maxResults=${MAX_MESSAGES}`,
    { accessToken, fetchFn },
  )
  const ids = list.messages ?? []
  // messages.get costs 5 quota units; 10 in flight stays well under the 250 units/sec per-user limit.
  const messages = await mapWithConcurrency(ids, 10, ({ id }) =>
    fetchJson<GmailMessage>(
      `${API}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { accessToken, fetchFn },
    ),
  )
  return messages.map((m) => mapGmailMessage(m, accountId, accountEmail))
}
