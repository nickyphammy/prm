/// <reference types="vite/client" />

// electron-vite exposes MAIN_VITE_* variables from apps/desktop/.env to the main process.
function read(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name]
  return value?.trim() || undefined
}

function required(name: string): string {
  const value = read(name)
  if (!value) {
    throw new Error(
      `${name} is not set. Copy apps/desktop/.env.example to apps/desktop/.env and fill it in.`,
    )
  }
  return value
}

export const env = {
  googleClientId: () => required('MAIN_VITE_GOOGLE_CLIENT_ID'),
  googleClientSecret: () => required('MAIN_VITE_GOOGLE_CLIENT_SECRET'),
  notionClientId: () => required('MAIN_VITE_NOTION_CLIENT_ID'),
  authProxyUrl: () => required('MAIN_VITE_AUTH_PROXY_URL').replace(/\/+$/, ''),
}
