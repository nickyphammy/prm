import type { ComponentType, ReactNode } from 'react'
import { CalendarDays, Mail, NotebookText } from 'lucide-react'
import type { Widget, WidgetType } from '@prm/shared'
import { AgendaWidget } from './AgendaWidget'
import type { WidgetProps } from './common'
import { InboxWidget } from './InboxWidget'
import { NotionWidget } from './NotionWidget'

interface WidgetDefinition<T extends WidgetType> {
  title: string
  description: string
  icon: ReactNode
  component: ComponentType<WidgetProps<T>>
  create(): Pick<Extract<Widget, { type: T }>, 'type' | 'config'> & {
    size: { w: number; h: number }
  }
}

export const WIDGETS: { [T in WidgetType]: WidgetDefinition<T> } = {
  agenda: {
    title: 'Agenda',
    description: 'Upcoming Google Calendar events',
    icon: <CalendarDays />,
    component: AgendaWidget,
    create: () => ({ type: 'agenda', config: { days: 7 }, size: { w: 4, h: 9 } }),
  },
  inbox: {
    title: 'Inbox',
    description: 'Unread and important Gmail',
    icon: <Mail />,
    component: InboxWidget,
    create: () => ({ type: 'inbox', config: { filter: 'unread' }, size: { w: 4, h: 9 } }),
  },
  notion: {
    title: 'Notion',
    description: 'A database or your recent pages',
    icon: <NotebookText />,
    component: NotionWidget,
    create: () => ({ type: 'notion', config: { dataSourceId: null }, size: { w: 4, h: 9 } }),
  },
}

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[]
