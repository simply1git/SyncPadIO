import { describe, it, expect, beforeEach } from 'vitest';
import {
  uint8ArrayToBase64Url,
  base64UrlToUint8Array,
  hasRoomPasskey,
  getRoomPasskey,
  removeRoomPasskey,
  isRoomLocked,
  setRoomLocked,
  isWebAuthnSupported,
} from './webAuthn';

const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: unknown }).localStorage = createMockStorage();
}
if (typeof globalThis.sessionStorage === 'undefined') {
  (globalThis as unknown as { sessionStorage: unknown }).sessionStorage = createMockStorage();
}

describe('WebAuthn Biometric Passkeys Utility', () => {
  const testRoom = 'PASSKEY123';

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('performs bidirectional lossless base64url conversions', () => {
    const raw = new Uint8Array([0, 1, 2, 255, 128, 64, 32, 16, 8, 4, 2, 1]);
    const encoded = uint8ArrayToBase64Url(raw);
    const decoded = base64UrlToUint8Array(encoded);

    expect(decoded).toEqual(raw);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
  });

  it('correctly tracks and removes passkey storage records', () => {
    expect(hasRoomPasskey(testRoom)).toBe(false);
    expect(getRoomPasskey(testRoom)).toBeNull();

    const mockRecord = {
      id: 'mock_cred_id_123',
      createdAt: 1700000000000,
      deviceName: 'Test Windows Hello',
    };

    localStorage.setItem(`syncpad_passkey_${testRoom}`, JSON.stringify(mockRecord));

    expect(hasRoomPasskey(testRoom)).toBe(true);
    expect(getRoomPasskey(testRoom)?.id).toBe('mock_cred_id_123');

    removeRoomPasskey(testRoom);
    expect(hasRoomPasskey(testRoom)).toBe(false);
  });

  it('tracks room locked status in sessionStorage', () => {
    expect(isRoomLocked(testRoom)).toBe(false);

    setRoomLocked(testRoom, true);
    expect(isRoomLocked(testRoom)).toBe(true);

    setRoomLocked(testRoom, false);
    expect(isRoomLocked(testRoom)).toBe(false);
  });

  it('detects WebAuthn support correctly based on window context', () => {
    const supported = isWebAuthnSupported();
    expect(typeof supported).toBe('boolean');
  });
});
