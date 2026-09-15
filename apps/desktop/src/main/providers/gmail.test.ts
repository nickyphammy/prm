import { describe, expect, it, vi } from 'vitest'
import { decodeEntities, displayName, fetchInbox, mapGmailMessage } from './gmail'

describe('gmail helpers', () => {
  it('decodes HTML entities in snippets', () => {
    expect(decodeEntities('Tom &amp; Jerry&#39;s &quot;show&quot; &#x1F600; &unknown;')).toBe(
      `Tom & Jerry's "show" 😀 &unknown;`,
    )
  })

  it('extracts display names from From headers', () => {
    expect(displayName('"Ada Lovelace" <ada@example.com>')).toBe('Ada Lovelace')
    expect(displayName('Ada <ada@example.com>')).toBe('Ada')
    expect(displayName('<ada@example.com>')).toBe('ada@example.com')
    expect(displayName('ada@example.com')).toBe('ada@example.com')
  })

  it('maps a metadata message', () => {
    const email = mapGmailMessage(
      {
        id: 'm1',
        threadId: 't1',
        labelIds: ['INBOX', 'UNREAD', 'IMPORTANT'],
        snippet: 'See you at 5 &amp; bring snacks',
        internalDate: '1789000000000',
        payload: {
          headers: [
            { name: 'From', value: 'Grace Hopper <grace@example.com>' },
            { name: 'subject', value: 'Launch' },
          ],
        },
      },
      'acc',
      'me@example.com',
    )
    expect(email).toEqual({
      kind: 'email',
      id: 'm1',
      accountId: 'acc',
      threadId: 't1',
      from: 'Grace Hopper',
      subject: 'Launch',
      snippet: 'See you at 5 & bring snacks',
      receivedAt: 1789000000000,
      unread: true,
      important: true,
      url: 'https://mail.google.com/mail/?authuser=me%40example.com#all/t1',
    })
  })
})

describe('fetchInbox', () => {
  it('lists inbox messages then fetches metadata for each, preserving order', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/messages?')) {
        return new Response(JSON.stringify({ messages: [{ id: 'a' }, { id: 'b' }] }))
      }
      const id = url.match(/messages\/(\w+)\?/)![1]
      return new Response(JSON.stringify({ id, threadId: `t-${id}`, internalDate: '1' }))
    })
    const emails = await fetchInbox('token', 'acc', 'me@example.com', fetchFn as typeof fetch)
    expect(emails.map((e) => e.id)).toEqual(['a', 'b'])
    expect(emails[0]).toMatchObject({
      subject: '(No subject)',
      from: '(Unknown sender)',
      unread: false,
    })
  })

  it('handles an empty inbox', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ resultSizeEstimate: 0 })))
    expect(await fetchInbox('token', 'acc', 'me@example.com', fetchFn as typeof fetch)).toEqual([])
  })
})
