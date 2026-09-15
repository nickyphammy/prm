import type { DesktopApi } from '@prm/shared'

declare global {
  interface Window {
    api: DesktopApi
  }
}
