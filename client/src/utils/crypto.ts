/**
 * SyncPadIO Cryptographic Engine (V2 - Zero Knowledge E2EE)
 * 
 * Features:
 * - AES-256-GCM authenticated encryption using native Web Crypto API.
 * - Dynamic per-room salt generation to prevent precomputed rainbow tables.
 * - URL Hash Key support (#k=...) for true zero-knowledge E2EE (keys never hit servers).
 * - Chunked Base64 encoding/decoding immune to call-stack overflow on large payloads.
 * - Backward compatibility with legacy "ENC:" format.
 */

export const ENC_PREFIX_V2 = 'ENC:v2:';
export const ENC_PREFIX_LEGACY = 'ENC:';
const PBKDF2_ITERATIONS = 100_000;
const CHUNK_SIZE = 8192;

/**
 * Safely converts an ArrayBuffer/Uint8Array to a Base64 string in chunks.
 * Avoids `Maximum call stack size exceeded` error on large inputs.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Safely converts a Base64 string to a Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generates a dynamic per-room cryptographic salt from the room ID
 * to ensure two rooms with different codes never share the same PBKDF2 salt.
 */
async function getRoomSalt(roomId: string): Promise<Uint8Array> {
  const seed = new TextEncoder().encode(`syncpadio-salt-v2:${roomId.toUpperCase()}`);
  const hashBuf = await crypto.subtle.digest('SHA-256', seed);
  return new Uint8Array(hashBuf);
}

/**
 * Generates a secure random 256-bit AES-GCM room key for Zero-Knowledge sharing.
 * Returns a URL-safe Base64 string.
 */
export async function generateRoomKey(): Promise<string> {
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(rawKey)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Derives a CryptoKey for AES-256-GCM.
 * If a custom raw secret (from URL hash or passphrase) is passed, imports or derives from it.
 * Otherwise, derives a key from the roomId with dynamic salt.
 */
export async function deriveKey(roomId: string, customSecret?: string): Promise<CryptoKey> {
  const secret = customSecret ? customSecret.trim() : roomId.trim().toUpperCase();
  const salt = await getRoomSalt(roomId);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns formatted string: "ENC:v2:<base64(12-byte IV + ciphertext + tag)>"
 */
export async function encryptText(plaintext: string, roomId: string, customSecret?: string): Promise<string> {
  const key = await deriveKey(roomId, customSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedPlaintext = new TextEncoder().encode(plaintext);

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedPlaintext
  );

  const combined = new Uint8Array(iv.byteLength + cipherBuf.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherBuf), iv.byteLength);

  return ENC_PREFIX_V2 + bytesToBase64(combined);
}

/**
 * Decrypt an encrypted text string.
 * Supports modern "ENC:v2:" and legacy "ENC:" format.
 * Returns null if decryption fails.
 */
export async function decryptText(encrypted: string, roomId: string, customSecret?: string): Promise<string | null> {
  if (!isEncrypted(encrypted)) return null;

  try {
    // 1. Try modern V2 format
    if (encrypted.startsWith(ENC_PREFIX_V2)) {
      const payloadBase64 = encrypted.slice(ENC_PREFIX_V2.length);
      const combined = base64ToBytes(payloadBase64);
      if (combined.byteLength < 13) return null;

      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const key = await deriveKey(roomId, customSecret);

      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
      );
      return new TextDecoder().decode(plainBuf);
    }

    // 2. Fallback to legacy V1 format (static salt)
    if (encrypted.startsWith(ENC_PREFIX_LEGACY)) {
      const legacySalt = new TextEncoder().encode('syncpadio-v1-salt-2026');
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(roomId),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      const legacyKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: legacySalt as unknown as BufferSource, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const payloadBase64 = encrypted.slice(ENC_PREFIX_LEGACY.length);
      const combined = base64ToBytes(payloadBase64);
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);

      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        legacyKey,
        ciphertext
      );
      return new TextDecoder().decode(plainBuf);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a text payload is encrypted
 */
export const isEncrypted = (text: string): boolean => {
  return typeof text === 'string' && (text.startsWith(ENC_PREFIX_V2) || text.startsWith(ENC_PREFIX_LEGACY));
};

/**
 * Extracts encryption key from window location hash (#k=...)
 */
export function getRoomKeyFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/#k=([A-Za-z0-9_-]+)/) || hash.match(/key=([A-Za-z0-9_-]+)/);
  return match && match[1] ? match[1] : null;
}

/**
 * Sets encryption key to window location hash without triggering a reload
 */
export function setRoomKeyToHash(key: string): void {
  if (typeof window === 'undefined') return;
  const currentPath = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', `${currentPath}#k=${key}`);
}

/**
 * Generates an end-to-end encrypted sharing URL with embedded key in hash fragment
 */
export function generateShareUrl(roomId: string, key?: string): string {
  const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://sync-pad-io.vercel.app';
  const pathname = typeof window !== 'undefined' && window.location.pathname ? window.location.pathname : '/';
  const base = `${origin}${pathname}?room=${roomId.toUpperCase()}`;
  return key ? `${base}#k=${key}` : base;
}
