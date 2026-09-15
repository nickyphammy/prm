import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { ProviderId, SyncState, Widget, WidgetConfigMap } from '@prm/shared'

const api = window.api

/** Everything cached in SQLite shares this root key, so one invalidation refreshes all widgets. */
const DATA = ['data'] as const

export const queryKeys = {
  accounts: [...DATA, 'accounts'] as const,
  events: (from: number, to: number) => [...DATA, 'events', from, to] as const,
  emails: (filter: string) => [...DATA, 'emails', filter] as const,
  notionItems: (dataSourceId: string | null) => [...DATA, 'notion', dataSourceId] as const,
  notionDataSources: ['notion-data-sources'] as const,
  widgets: ['widgets'] as const,
}

/** Refetch cached data whenever the main process finishes a sync. */
export function subscribeToMainEvents(client: QueryClient): () => void {
  return api.onDataUpdated(() => void client.invalidateQueries({ queryKey: DATA }))
}

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.accounts, queryFn: api.listAccounts })
}

export function useEvents(from: number, to: number) {
  return useQuery({
    queryKey: queryKeys.events(from, to),
    queryFn: () => api.listEvents({ from, to }),
  })
}

export function useEmails(filter: WidgetConfigMap['inbox']['filter']) {
  return useQuery({ queryKey: queryKeys.emails(filter), queryFn: () => api.listEmails(filter) })
}

export function useNotionItems(dataSourceId: string | null) {
  return useQuery({
    queryKey: queryKeys.notionItems(dataSourceId),
    queryFn: () => api.listNotionItems(dataSourceId),
  })
}

export function useNotionDataSources(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notionDataSources,
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const result = await api.listNotionDataSources()
      if (!result.ok) throw new Error(result.error)
      return result.value
    },
  })
}

export function useWidgets() {
  return useQuery({ queryKey: queryKeys.widgets, queryFn: api.listWidgets, staleTime: Infinity })
}

export function useSaveWidgets() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (widgets: Widget[]) => api.saveWidgets(widgets),
    onMutate: (widgets) => client.setQueryData(queryKeys.widgets, widgets),
  })
}

export function useConnect() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (provider: ProviderId) => {
      const result = await api.connect(provider)
      if (!result.ok) throw new Error(result.error)
      return result.value
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: DATA })
      void client.invalidateQueries({ queryKey: queryKeys.notionDataSources })
    },
  })
}

export function useDisconnect() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (accountId: string) => {
      const result = await api.disconnect(accountId)
      if (!result.ok) throw new Error(result.error)
      return result.value
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: DATA })
      void client.invalidateQueries({ queryKey: queryKeys.notionDataSources })
    },
  })
}

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>({ running: false, lastRunAt: null })
  useEffect(() => {
    void api.getSyncState().then(setState)
    return api.onSyncStateChanged(setState)
  }, [])
  return state
}

export const openExternal = (url: string): void => void api.openExternal(url)
export const syncNow = (): Promise<void> => api.syncNow()
export const cancelConnect = (): Promise<void> => api.cancelConnect()
