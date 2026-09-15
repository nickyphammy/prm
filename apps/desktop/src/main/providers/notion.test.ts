import type { PageObjectResponse } from '@notionhq/client'
import { describe, expect, it } from 'vitest'
import { mapNotionPage } from './notion'

const rich = (text: string) => [{ type: 'text', plain_text: text, text: { content: text } }]

function page(
  properties: Record<string, unknown>,
  extra: Partial<PageObjectResponse> = {},
): PageObjectResponse {
  return {
    object: 'page',
    id: 'page-1',
    url: 'https://www.notion.so/page-1',
    last_edited_time: '2026-09-14T10:00:00.000Z',
    icon: { type: 'emoji', emoji: '🚀' },
    properties,
    ...extra,
  } as unknown as PageObjectResponse
}

describe('mapNotionPage', () => {
  it('picks the title, status and date properties whatever they are named', () => {
    const item = mapNotionPage(
      page({
        Name: { id: 'title', type: 'title', title: rich('Ship v1') },
        Stage: { id: 's', type: 'status', status: { name: 'In progress' } },
        Due: { id: 'd', type: 'date', date: { start: '2026-09-20T15:00:00.000Z', end: null } },
      }),
      'acc',
      'ds-1',
    )
    expect(item).toEqual({
      kind: 'notion',
      id: 'page-1',
      accountId: 'acc',
      dataSourceId: 'ds-1',
      title: 'Ship v1',
      status: 'In progress',
      date: Date.parse('2026-09-20T15:00:00.000Z'),
      editedAt: Date.parse('2026-09-14T10:00:00.000Z'),
      url: 'https://www.notion.so/page-1',
      icon: '🚀',
    })
  })

  it('falls back to select for status, local midnight for date-only values, and Untitled', () => {
    const item = mapNotionPage(
      page(
        {
          Title: { id: 'title', type: 'title', title: [] },
          Priority: { id: 'p', type: 'select', select: { name: 'High' } },
          When: { id: 'w', type: 'date', date: { start: '2026-09-20', end: null } },
        },
        {
          icon: { type: 'external', external: { url: 'https://example.com/i.png' } },
        } as Partial<PageObjectResponse>,
      ),
      'acc',
      null,
    )
    expect(item.title).toBe('Untitled')
    expect(item.status).toBe('High')
    expect(item.date).toBe(new Date(2026, 8, 20).getTime())
    expect(item.icon).toBe('https://example.com/i.png')
  })

  it('leaves status and date null when the page has neither', () => {
    const item = mapNotionPage(
      page({ title: { id: 'title', type: 'title', title: rich('Notes') } }, { icon: null }),
      'acc',
      null,
    )
    expect(item).toMatchObject({ title: 'Notes', status: null, date: null, icon: null })
  })
})
