import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, decryptJson, encrypt, encryptJson, keyFromHex } from '../crypto';

const KEY_HEX = randomBytes(32).toString('hex');

/** Independent reference implementation of the API's format: iv:tag:ciphertext (base64). */
function referenceEncrypt(plaintext: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${encrypted.toString('base64')}`;
}

describe('crypto', () => {
  it('decrypts a payload produced by the reference implementation', () => {
    const secret = JSON.stringify({ siteUrl: 'https://blog.example.com', username: 'admin' });
    const payload = referenceEncrypt(secret, KEY_HEX);
    expect(payload.split(':')).toHaveLength(3);
    expect(decrypt(payload, KEY_HEX)).toBe(secret);
    expect(decryptJson<{ username: string }>(payload, KEY_HEX).username).toBe('admin');
  });

  it('round-trips with its own encrypt()', () => {
    const payload = encrypt('hello wörld ✓', KEY_HEX);
    expect(decrypt(payload, KEY_HEX)).toBe('hello wörld ✓');
    const json = encryptJson({ a: 1, b: [true] }, KEY_HEX);
    expect(decryptJson(json, KEY_HEX)).toEqual({ a: 1, b: [true] });
  });

  it('produces a different IV every time', () => {
    expect(encrypt('same', KEY_HEX)).not.toBe(encrypt('same', KEY_HEX));
  });

  it('rejects tampered ciphertext', () => {
    const payload = encrypt('sensitive', KEY_HEX);
    const [iv, tag, data] = payload.split(':') as [string, string, string];
    const flipped = Buffer.from(data, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    expect(() => decrypt(`${iv}:${tag}:${flipped.toString('base64')}`, KEY_HEX)).toThrow();
  });

  it('rejects a wrong key and malformed keys', () => {
    const payload = encrypt('sensitive', KEY_HEX);
    expect(() => decrypt(payload, randomBytes(32).toString('hex'))).toThrow();
    expect(() => keyFromHex('too-short')).toThrow(/ENCRYPTION_KEY/);
  });

  it('falls back to process.env.ENCRYPTION_KEY', () => {
    const previous = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = KEY_HEX;
    try {
      expect(decrypt(encrypt('env-key'))).toBe('env-key');
    } finally {
      if (previous === undefined) delete process.env.ENCRYPTION_KEY;
      else process.env.ENCRYPTION_KEY = previous;
    }
  });
});
