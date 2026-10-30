import { describe, it, expect } from 'vitest';
import {
  encryptText,
  decryptText,
  isEncrypted,
  generateRoomKey,
  bytesToBase64,
  base64ToBytes,
  generateShareUrl,
  ENC_PREFIX_V2,
  encryptFile,
  decryptFile,
  safeDecryptFile,
  deriveKey,
  isFileEncrypted,
  getMimeTypeFromName
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

  describe('Client-Side Hardware-Accelerated File Encryption', () => {
    it('encrypts and decrypts a binary file with exact byte-for-byte fidelity', async () => {
      const roomId = 'FILE_ROOM_1';
      // Create sample binary data
      const sampleBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x42, 0x13, 0x37]);
      const blob = new Blob([sampleBytes], { type: 'application/octet-stream' });

      const { encryptedBlob, originalSize, originalName } = await encryptFile(blob, 'sample.bin', roomId);

      expect(originalSize).toBe(sampleBytes.byteLength);
      expect(originalName).toBe('sample.bin');
      // Encrypted payload is IV (12B) + ciphertext + tag (16B) = originalSize + 28B
      expect(encryptedBlob.size).toBe(sampleBytes.byteLength + 28);

      const encryptedBuf = await encryptedBlob.arrayBuffer();
      const decryptedBlob = await decryptFile(encryptedBuf, roomId);
      const decryptedBuf = await decryptedBlob.arrayBuffer();
      const decryptedBytes = new Uint8Array(decryptedBuf);

      expect(Array.from(decryptedBytes)).toEqual(Array.from(sampleBytes));
    });

    it('enforces Zero-Knowledge authentication tag (fails with wrong room key)', async () => {
      const roomId = 'SECURE_FILES';
      const secret = 'valid-room-key-1234';
      const payload = new TextEncoder().encode('Confidential financial sheet');
      const blob = new Blob([payload], { type: 'text/plain' });

      const { encryptedBlob } = await encryptFile(blob, 'sheet.txt', roomId, secret);
      const encBuf = await encryptedBlob.arrayBuffer();

      // Decryption with wrong secret should throw
      await expect(decryptFile(encBuf, roomId, 'wrong-room-key')).rejects.toThrow();

      // Safe decrypt should fall back to raw buffer on failure
      const fallbackBlob = await safeDecryptFile(encBuf, roomId, 'wrong-room-key');
      expect(fallbackBlob.size).toBe(encBuf.byteLength);

      // Decryption with correct secret succeeds perfectly
      const validBlob = await decryptFile(encBuf, roomId, secret);
      const text = await validBlob.text();
      expect(text).toBe('Confidential financial sheet');
    });

    it('leverages in-memory CryptoKey cache for near-instantaneous subsequent derivations', async () => {
      const roomId = 'CACHE_TEST';
      const secret = 'speedy-key-2026';

      // First derivation performs PBKDF2 (100,000 rounds)
      const t0 = performance.now();
      await deriveKey(roomId, secret);
      const firstDuration = performance.now() - t0;

      // Second derivation should hit cache in < 1ms
      const t1 = performance.now();
      await deriveKey(roomId, secret);
      const cachedDuration = performance.now() - t1;

      expect(cachedDuration).toBeLessThan(5);
      expect(firstDuration).toBeGreaterThanOrEqual(0);
    });

    it('encrypts and decrypts 1MB binary file in milliseconds (fastest pipeline)', async () => {
      const roomId = 'BENCH_ROOM';
      const oneMbBuffer = new Uint8Array(1024 * 1024);
      for (let i = 0; i < oneMbBuffer.length; i++) oneMbBuffer[i] = i % 256;
      const fileBlob = new Blob([oneMbBuffer], { type: 'application/octet-stream' });

      const tStart = performance.now();
      const { encryptedBlob } = await encryptFile(fileBlob, 'large.bin', roomId);
      const encBuf = await encryptedBlob.arrayBuffer();
      const decryptedBlob = await decryptFile(encBuf, roomId);
      const totalTimeMs = performance.now() - tStart;

      expect(decryptedBlob.size).toBe(1024 * 1024);
      // Native Web Crypto AES-GCM takes well under 250ms for 1MB
      expect(totalTimeMs).toBeLessThan(500);
    });

    it('identifies encrypted files accurately', () => {
      expect(isFileEncrypted({ name: 'regular.pdf', storage_path: 'ROOM/123_regular.pdf' })).toBe(false);
      expect(isFileEncrypted({ name: 'regular.pdf', is_encrypted: true })).toBe(true);
      expect(isFileEncrypted({ name: 'doc.txt', storage_path: 'ROOM/123_enc_doc.txt' })).toBe(true);
      expect(isFileEncrypted({ name: 'photo_enc_v2.png' })).toBe(true);
    });

    it('maps file extensions to correct MIME types', () => {
      expect(getMimeTypeFromName('test.png')).toBe('image/png');
      expect(getMimeTypeFromName('movie.mp4')).toBe('video/mp4');
      expect(getMimeTypeFromName('doc.pdf')).toBe('application/pdf');
      expect(getMimeTypeFromName('photo.HEIC')).toBe('image/heic');
      expect(getMimeTypeFromName('unknown.xyz')).toBe('application/octet-stream');
    });

    it('friend uploads image with room code; host with hash key decrypts seamlessly without corruption', async () => {
      const roomId = 'ROOM77';
      // Simulate real PNG image header bytes [137, 80, 78, 71, 13, 10, 26, 10, ...]
      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
      const imageBlob = new Blob([pngBytes], { type: 'image/png' });

      // 1. Friend joined via room code (encryptionKey is undefined)
      const { encryptedBlob } = await encryptFile(imageBlob, 'notes.png', roomId, undefined);
      const encBuf = await encryptedBlob.arrayBuffer();

      // 2. Host has a custom hash key in their URL (#k=hostKey123)
      const hostHashKey = 'hostKey123';
      const decryptedBlob = await safeDecryptFile(encBuf, roomId, hostHashKey, 'image/png');

      // 3. Host successfully recovers the clean uncorrupted PNG image
      expect(decryptedBlob.size).toBe(pngBytes.byteLength);
      expect(decryptedBlob.type).toBe('image/png');

      const recoveredBuf = await decryptedBlob.arrayBuffer();
      const recoveredBytes = new Uint8Array(recoveredBuf);
      expect(Array.from(recoveredBytes)).toEqual(Array.from(pngBytes));
    });

    it('text snippets decrypt seamlessly between peers even with mismatched hash keys', async () => {
      const roomId = 'TEAM88';
      const message = 'Meeting notes: ship client-side E2EE files';

      // Friend joined via room code and encrypts with roomId
      const ciphertext = await encryptText(message, roomId, undefined);

      // Host has a custom hash key, but decryptText falls back to roomId
      const decrypted = await decryptText(ciphertext, roomId, 'differentHostKey');
      expect(decrypted).toBe(message);
    });
  });
});

