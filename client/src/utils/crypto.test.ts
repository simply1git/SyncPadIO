import { describe, it, expect } from 'vitest';
import {
  encryptText,
  decryptText,
  isEncrypted,
  generateRoomKey,
  bytesToBase64,
  base64ToBytes,
  generateShareUrl,
  ENC_PREFIX_V2
} from './crypto';

describe('SyncPadIO Cryptography Engine V2', () => {
  it('correctly converts bytes to Base64 and back in chunks', () => {
    const original = new Uint8Array([1, 2, 3, 255, 128, 0, 42]);
    const b64 = bytesToBase64(original);
    const roundtrip = base64ToBytes(b64);
    expect(Array.from(roundtrip)).toEqual(Array.from(original));
  });

  it('safely handles large payloads without call-stack overflow', () => {
    // 100KB buffer (would crash standard String.fromCharCode(...spread))
    const large = new Uint8Array(100 * 1024);
    for (let i = 0; i < large.length; i++) large[i] = i % 256;
    const b64 = bytesToBase64(large);
    expect(typeof b64).toBe('string');
    const recovered = base64ToBytes(b64);
    expect(recovered.length).toBe(large.length);
    expect(recovered[500]).toBe(500 % 256);
  });

  it('generates high-entropy room keys for zero-knowledge sharing', async () => {
    const key1 = await generateRoomKey();
    const key2 = await generateRoomKey();
    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key1).not.toBe(key2);
    expect(key1.length).toBeGreaterThanOrEqual(40);
  });

  it('encrypts and decrypts text with roomId derivation', async () => {
    const roomId = 'TEST99';
    const plaintext = 'Secret developer credentials & API keys!';
    const ciphertext = await encryptText(plaintext, roomId);

    expect(isEncrypted(ciphertext)).toBe(true);
    expect(ciphertext.startsWith(ENC_PREFIX_V2)).toBe(true);
    expect(ciphertext).not.toContain(plaintext);

    const decrypted = await decryptText(ciphertext, roomId);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypts and decrypts text with custom zero-knowledge secret', async () => {
    const roomId = 'ROOM01';
    const customSecret = 'my-super-secret-passphrase-2026';
    const plaintext = 'Confidential roadmap details';

    const ciphertext = await encryptText(plaintext, roomId, customSecret);
    expect(isEncrypted(ciphertext)).toBe(true);

    // Decrypting with wrong secret fails
    const failed = await decryptText(ciphertext, roomId, 'wrong-secret');
    expect(failed).toBeNull();

    // Decrypting without secret fails
    const failedDefault = await decryptText(ciphertext, roomId);
    expect(failedDefault).toBeNull();

    // Decrypting with correct secret succeeds
    const success = await decryptText(ciphertext, roomId, customSecret);
    expect(success).toBe(plaintext);
  });

  it('rejects tampered ciphertexts gracefully', async () => {
    const roomId = 'TAMPER1';
    const ciphertext = await encryptText('Legitimate message', roomId);
    // Tamper with payload
    const tampered = ciphertext.slice(0, -4) + 'AAAA';
    const decrypted = await decryptText(tampered, roomId);
    expect(decrypted).toBeNull();
  });

  it('accurately identifies encrypted vs plaintext strings', () => {
    expect(isEncrypted('Hello World')).toBe(false);
    expect(isEncrypted('ENC:v2:SGVsbG8=')).toBe(true);
    expect(isEncrypted('ENC:SGVsbG8=')).toBe(true);
  });

  it('generates correct zero-knowledge share URL with hash key', () => {
    const shareUrl = generateShareUrl('MYROOM', 'abc123key');
    expect(shareUrl).toContain('?room=MYROOM');
    expect(shareUrl).toContain('#k=abc123key');
  });
});

