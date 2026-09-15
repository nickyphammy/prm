import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * AES-256-GCM for cached provider data (email subjects, event titles, Notion pages).
 * Output layout: iv (12) | auth tag (16) | ciphertext. GCM also detects tampering.
 */
export class DataCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('DataCipher key must be 32 bytes')
  }

  static generateKey(): Buffer {
    return randomBytes(32)
  }

  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
  }

  decrypt(blob: Buffer): string {
    const iv = blob.subarray(0, IV_BYTES)
    const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([
      decipher.update(blob.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8')
  }
}
