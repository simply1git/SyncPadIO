import { PasskeyRecord } from '../types';

const PASSKEY_STORAGE_PREFIX = 'syncpad_passkey_';
const LOCKED_STORAGE_PREFIX = 'syncpad_locked_';

export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.PublicKeyCredential);
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getRoomPasskey(roomId: string): PasskeyRecord | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(`${PASSKEY_STORAGE_PREFIX}${roomId.toUpperCase()}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PasskeyRecord;
  } catch {
    return null;
  }
}

export function hasRoomPasskey(roomId: string): boolean {
  return Boolean(getRoomPasskey(roomId));
}

export function removeRoomPasskey(roomId: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`${PASSKEY_STORAGE_PREFIX}${roomId.toUpperCase()}`);
  }
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(`${LOCKED_STORAGE_PREFIX}${roomId.toUpperCase()}`);
  }
}

export function isRoomLocked(roomId: string): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(`${LOCKED_STORAGE_PREFIX}${roomId.toUpperCase()}`) === 'true';
}

export function setRoomLocked(roomId: string, locked: boolean): void {
  if (typeof sessionStorage === 'undefined') return;
  if (locked) {
    sessionStorage.setItem(`${LOCKED_STORAGE_PREFIX}${roomId.toUpperCase()}`, 'true');
  } else {
    sessionStorage.removeItem(`${LOCKED_STORAGE_PREFIX}${roomId.toUpperCase()}`);
  }
}

/**
 * Register a biometric passkey (Face ID, Touch ID, Windows Hello) for a SyncPadIO Room
 */
export async function registerRoomPasskey(roomId: string, deviceName?: string): Promise<PasskeyRecord> {
  if (!isWebAuthnSupported()) {
    throw new Error('Biometrics / WebAuthn is not supported on this browser or platform');
  }

  const cleanRoom = roomId.toUpperCase();
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const userIdBytes = new TextEncoder().encode(cleanRoom);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'SyncPadIO Ephemeral',
        id: window.location.hostname || 'localhost',
      },
      user: {
        id: userIdBytes,
        name: `syncpad-room-${cleanRoom.toLowerCase()}`,
        displayName: `SyncPad Room ${cleanRoom}`,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      timeout: 60000,
    },
  })) as PublicKeyCredential;

  if (!credential || !credential.rawId) {
    throw new Error('Failed to create biometric passkey credential');
  }

  const credIdString = uint8ArrayToBase64Url(new Uint8Array(credential.rawId));
  const record: PasskeyRecord = {
    id: credIdString,
    createdAt: Date.now(),
    deviceName: deviceName || 'Device Platform Authenticator',
  };

  localStorage.setItem(`${PASSKEY_STORAGE_PREFIX}${cleanRoom}`, JSON.stringify(record));
  return record;
}

/**
 * Verify identity using biometric passkey to unlock room
 */
export async function verifyRoomPasskey(roomId: string): Promise<boolean> {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported');
  }

  const cleanRoom = roomId.toUpperCase();
  const stored = getRoomPasskey(cleanRoom);
  if (!stored) {
    throw new Error('No biometric passkey registered for this room');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const credentialIdBytes = base64UrlToUint8Array(stored.id);

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          id: credentialIdBytes as unknown as BufferSource,
          type: 'public-key',
        },
      ],
      userVerification: 'preferred',
      timeout: 60000,
    },
  });

  const verified = Boolean(assertion);
  if (verified) {
    setRoomLocked(cleanRoom, false);
  }
  return verified;
}
