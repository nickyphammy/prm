import { safeStorage } from 'electron'

/** Encrypts with a key held in the OS keychain (macOS Keychain, Windows DPAPI, libsecret on Linux). */
export function encryptJson(value: unknown): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption is unavailable, so credentials cannot be stored securely.')
  }
  return safeStorage.encryptString(JSON.stringify(value))
}

export function decryptJson<T>(blob: Buffer): T {
  return JSON.parse(safeStorage.decryptString(blob)) as T
}
