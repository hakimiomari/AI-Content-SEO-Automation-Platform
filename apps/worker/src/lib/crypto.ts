import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM helpers compatible with the API's `EncryptionService`.
 * Wire format: `<iv>:<authTag>:<ciphertext>` — each part base64 encoded.
 * Key: 32 bytes supplied as 64 hex characters (`openssl rand -hex 32`) in ENCRYPTION_KEY.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export class CryptoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoConfigurationError';
  }
}

export function keyFromHex(keyHex?: string): Buffer {
  const hex = (keyHex ?? process.env.ENCRYPTION_KEY ?? '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new CryptoConfigurationError(
      'ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters).',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string, keyHex?: string): string {
  const key = keyFromHex(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decrypt(payload: string, keyHex?: string): string {
  const key = keyFromHex(keyHex);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload: expected "iv:tag:ciphertext" (base64).');
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  if (iv.length === 0 || tag.length !== 16) {
    throw new Error('Invalid encrypted payload: bad IV or auth tag length.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function encryptJson(value: unknown, keyHex?: string): string {
  return encrypt(JSON.stringify(value), keyHex);
}

export function decryptJson<T = unknown>(payload: string, keyHex?: string): T {
  return JSON.parse(decrypt(payload, keyHex)) as T;
}
