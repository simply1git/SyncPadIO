import { describe, it, expect } from 'vitest';
import {
  extractRoomCode,
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
});
