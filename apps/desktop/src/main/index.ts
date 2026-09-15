import { join } from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { IPC_EVENTS, type ProviderId } from '@prm/shared'
import { APP_ORIGIN, handleAppScheme, registerAppScheme } from './app-protocol'
import { openDb, type Db } from './db'
import { registerIpc } from './ipc'
import { googleAdapter } from './providers/google-adapter'
import { notionAdapter } from './providers/notion-adapter'
import type { ProviderAdapter } from './providers/types'
import { decryptJson, encryptJson } from './secrets'
import { Store } from './store'
import { SyncService } from './sync'

let mainWindow: BrowserWindow | null = null

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function createWindow(onFocus: () => void): BrowserWindow {
  const win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'PRM Dashboard',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f7f7f5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  win.once('ready-to-show', () => win.show())
  win.on('focus', onFocus)

  // Links open in the user's browser; the app window never navigates away or spawns windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadURL(`${APP_ORIGIN}/index.html`)
  }
  return win
}

/**
 * The store unwraps its data key through the OS keychain at startup. If the user denies
 * the keychain prompt (or it's unavailable), explain why it matters instead of opening nothing.
 */
function openEncryptedStore(db: Db): Store | null {
  for (;;) {
    try {
      return new Store(db, { encrypt: encryptJson, decrypt: decryptJson })
    } catch (err) {
      console.error('[startup] could not unlock encrypted storage:', err)
      const choice = dialog.showMessageBoxSync({
        type: 'error',
        buttons: ['Try Again', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        message: 'PRM Dashboard needs access to your keychain',
        detail:
          'Your connected accounts and cached data are encrypted with a key kept in the system keychain. ' +
          'When macOS asks, choose "Always Allow". If no prompt appears, quit and reopen PRM Dashboard.',
      })
      if (choice === 1) return null
    }
  }
}

registerAppScheme()

// Honor Chromium's --user-data-dir so a separate profile (e.g. a test run) gets its own data and lock.
const userDataDir = app.commandLine.getSwitchValue('user-data-dir')
if (userDataDir) app.setPath('userData', userDataDir)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    handleAppScheme(join(__dirname, '../renderer'))
    const db = openDb(join(app.getPath('userData'), 'prm.db'))
    const store = openEncryptedStore(db)
    if (!store) {
      app.quit()
      return
    }
    const adapters = { google: googleAdapter, notion: notionAdapter } as Record<
      ProviderId,
      ProviderAdapter<never>
    >
    const sync = new SyncService(store, adapters, {
      dataUpdated: () => broadcast(IPC_EVENTS.dataUpdated),
      stateChanged: (state) => broadcast(IPC_EVENTS.syncState, state),
    })

    registerIpc({ store, sync, adapters })
    mainWindow = createWindow(() => sync.onWindowFocus())
    sync.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0)
        mainWindow = createWindow(() => sync.onWindowFocus())
    })
    app.on('before-quit', () => sync.stop())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
