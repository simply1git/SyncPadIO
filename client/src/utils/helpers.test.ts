import { describe, it, expect } from 'vitest';
import {
  extractRoomCode,
  parseQrCodeData,
  formatFileSize,
  timeAgo,
  isValidRoomId,
  validateFile,
  truncate,
  detectCodeLanguage,
  MAX_FILE_SIZE
} from './helpers';

describe('SyncPadIO Helper Utilities', () => {
  it('extracts room code from plain text and various URL formats', () => {
    expect(extractRoomCode('ABC123')).toBe('ABC123');
    expect(extractRoomCode('abc123')).toBe('ABC123');
    expect(extractRoomCode('  room-xyz  ')).toBe('ROOMXYZ');
    expect(extractRoomCode('https://sync-pad-io.vercel.app/?room=TEAM42')).toBe('TEAM42');
    expect(extractRoomCode('http://localhost:5173/?foo=bar&room=SECRET99#k=key')).toBe('SECRET99');
  });

  it('formats file sizes accurately', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024 * 5.5)).toBe('5.5 MB');
  });

  it('calculates relative time correctly', () => {
    const now = Date.now();
    expect(timeAgo(now - 10_000)).toBe('just now');
    expect(timeAgo(now - 120_000)).toBe('2m ago');
    expect(timeAgo(now - 7_200_000)).toBe('2h ago');
  });

  it('validates room ID formats correctly', () => {
    expect(isValidRoomId('AB')).toBe(true);
    expect(isValidRoomId('ROOM123')).toBe(true);
    expect(isValidRoomId('A')).toBe(false); // Too short
    expect(isValidRoomId('TOOLONGROOMCODE123456')).toBe(false); // Too long
    expect(isValidRoomId('INVALID-CODE')).toBe(false); // Contains hyphen
  });

  it('validates file uploads and rejects dangerous executable extensions', () => {
    expect(validateFile({ name: 'document.pdf', size: 1024 }).valid).toBe(true);
    expect(validateFile({ name: 'code.ts', size: 500 }).valid).toBe(true);
    expect(validateFile({ name: 'photo.png', size: 1024 * 1024 }).valid).toBe(true);

    // Rejection of blocked extensions
    expect(validateFile({ name: 'malware.exe', size: 100 }).valid).toBe(false);
    expect(validateFile({ name: 'script.bat', size: 100 }).valid).toBe(false);
    expect(validateFile({ name: 'payload.vbs', size: 100 }).valid).toBe(false);
    expect(validateFile({ name: 'attack.sh', size: 100 }).valid).toBe(false);
    expect(validateFile({ name: 'hack.ps1', size: 100 }).valid).toBe(false);

    // Rejection of oversized files
    expect(validateFile({ name: 'huge.zip', size: MAX_FILE_SIZE + 1 }).valid).toBe(false);
  });

  it('truncates strings cleanly', () => {
    expect(truncate('Short', 10)).toBe('Short');
    expect(truncate('A very long string that should be trimmed', 10)).toBe('A very lon...');
  });

  it('detects programming languages heuristically for syntax highlighting', () => {
    expect(detectCodeLanguage('{"name": "test", "active": true}')).toBe('json');
    expect(detectCodeLanguage('SELECT id, name FROM users;')).toBe('sql');
    expect(detectCodeLanguage('import React, { useState } from "react";')).toBe('typescript');
    expect(detectCodeLanguage('npm run build')).toBe('bash');
  });

  it('parses QR code payloads with room codes and optional E2EE keys', () => {
    // 1. Full production share URL with #k= key
    const full = parseQrCodeData('https://sync-pad-io.vercel.app/?room=ALPHA1#k=secret_token_123');
    expect(full.roomCode).toBe('ALPHA1');
    expect(full.encryptionKey).toBe('secret_token_123');

    // 2. Localhost URL with key
    const local = parseQrCodeData('http://localhost:5173/?room=BETA99#k=my-e2ee-key');
    expect(local.roomCode).toBe('BETA99');
    expect(local.encryptionKey).toBe('my-e2ee-key');

    // 3. Query string only with key
    const query = parseQrCodeData('?room=GAMMA7#k=key_456');
    expect(query.roomCode).toBe('GAMMA7');
    expect(query.encryptionKey).toBe('key_456');

    // 4. URL without key
    const noKey = parseQrCodeData('https://sync-pad-io.vercel.app/?room=DELTA5');
    expect(noKey.roomCode).toBe('DELTA5');
    expect(noKey.encryptionKey).toBeUndefined();

    // 5. Plain room code
    const plain = parseQrCodeData('EPSILON9');
    expect(plain.roomCode).toBe('EPSILON9');
    expect(plain.encryptionKey).toBeUndefined();

    // 6. Plain code with #k=
    const plainWithKey = parseQrCodeData('ZETA42#k=special_key');
    expect(plainWithKey.roomCode).toBe('ZETA42');
    expect(plainWithKey.encryptionKey).toBe('special_key');
  });
});

