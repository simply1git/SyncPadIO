/**
 * AES-256-GCM client-side encryption using Web Crypto API.
 * Inspired by PandaShare's encryption strategy.
 *
 * Key = PBKDF2(roomId, fixedSalt, 100_000 iterations, SHA-256) → AES-256-GCM key
 * Anyone with the room code can encrypt/decrypt — no extra key sharing needed.
 *
 * Cipher format: "ENC:" + base64(12-byte-IV + ciphertext + 16-byte-AuthTag)
 */

const SALT = new TextEncoder().encode('syncpadio-v1-salt-2026');
const ITERATIONS = 100_000;
export const ENC_PREFIX = 'ENC:';

async function deriveKey(roomId: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(roomId),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt plaintext with roomId-derived key. Returns "ENC:..." string. */
export async function encryptText(plaintext: string, roomId: string): Promise<string> {
  const key = await deriveKey(roomId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);
  return ENC_PREFIX + btoa(String.fromCharCode(...combined));
}

/** Decrypt an "ENC:..." string. Returns null if decryption fails. */
export async function decryptText(encrypted: string, roomId: string): Promise<string | null> {
  if (!encrypted.startsWith(ENC_PREFIX)) return null;
  try {
    const key = await deriveKey(roomId);
    const combined = Uint8Array.from(atob(encrypted.slice(ENC_PREFIX.length)), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null;
  }
}

/** Check if a string is an encrypted snippet */
export const isEncrypted = (text: string) => text.startsWith(ENC_PREFIX);
