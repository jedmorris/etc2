/**
 * Server-side token encryption/decryption using AES-256-GCM.
 *
 * The encryption key (TOKEN_ENCRYPTION_KEY) must be a 32-byte
 * hex-encoded string (64 hex chars). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Compatible with the Python execution layer's token_manager.py
 * which uses Fernet — both encrypt at rest, but the TS layer
 * uses its own format (iv:tag:ciphertext in base64).
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set')
  }
  return Buffer.from(key, 'hex')
}

/**
 * Encrypt a plaintext string. Returns a base64 string containing
 * the IV, auth tag, and ciphertext concatenated.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Format: iv (12 bytes) + tag (16 bytes) + ciphertext
  const combined = Buffer.concat([iv, tag, encrypted])
  return combined.toString('base64')
}

/**
 * Decrypt a token previously encrypted with encryptToken().
 */
export function decryptToken(encoded: string): string {
  const key = getKey()
  const combined = Buffer.from(encoded, 'base64')

  const iv = combined.subarray(0, IV_LENGTH)
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/**
 * Generate a cryptographically secure random secret (for webhook secrets etc.)
 */
export function generateSecret(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex')
}
