import { contextBridge, ipcRenderer } from 'electron'
import { IPC_EVENTS, type DesktopApi, type SyncState } from '@prm/shared'

const invoke =
  <K extends keyof DesktopApi>(channel: K) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: DesktopApi = {
  listAccounts: invoke('listAccounts'),
  connect: invoke('connect'),
  cancelConnect: invoke('cancelConnect'),
  disconnect: invoke('disconnect'),
  listEvents: invoke('listEvents'),
  listEmails: invoke('listEmails'),
  listNotionItems: invoke('listNotionItems'),
  listNotionDataSources: invoke('listNotionDataSources'),
  listWidgets: invoke('listWidgets'),
  saveWidgets: invoke('saveWidgets'),
  syncNow: invoke('syncNow'),
  getSyncState: invoke('getSyncState'),
  openExternal: invoke('openExternal'),
  onDataUpdated: (listener) => subscribe(IPC_EVENTS.dataUpdated, listener),
  onSyncStateChanged: (listener) => subscribe<SyncState>(IPC_EVENTS.syncState, listener),
}

contextBridge.exposeInMainWorld('api', api)
