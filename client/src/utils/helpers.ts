/**
 * SyncPadIO Core Helper Utilities
 */

/**
 * Extracts and normalizes room code from plain text or URLs (e.g. "?room=ABC123")
 */
export const extractRoomCode = (input: string): string => {
  if (!input) return '';
  const trimmed = input.trim();
  if (trimmed.includes('room=')) {
    const match = trimmed.match(/[?&]room=([A-Za-z0-9]+)/);
    if (match && match[1]) return match[1].toUpperCase().slice(0, 12);
  }
  return trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
};

/**
 * Parses QR code content or pasted room strings.
 * Extracts normalized room code (up to 12 alphanumeric characters) and optional E2EE encryption key (#k=...).
 */
export function parseQrCodeData(input: string): { roomCode: string; encryptionKey?: string } {
  if (!input) return { roomCode: '' };
  const trimmed = input.trim();

  let roomCode = '';
  let encryptionKey: string | undefined = undefined;

  // 1. Try URL parsing if input looks like a URL or query string
  try {
    const urlString = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : trimmed.startsWith('/') || trimmed.startsWith('?')
      ? `https://syncpad.local${trimmed}`
      : `https://syncpad.local/?room=${trimmed}`;

    const parsed = new URL(urlString);
    const roomParam = parsed.searchParams.get('room');
    if (roomParam) {
      roomCode = roomParam.toUpperCase().slice(0, 12);
    }

    // Check URL hash for encryption key: #k=... or #...
    if (parsed.hash) {
      const hashStr = parsed.hash.replace(/^#/, '');
      const kMatch = hashStr.match(/(?:^|&)k=([^&]+)/);
      if (kMatch && kMatch[1]) {
        encryptionKey = decodeURIComponent(kMatch[1]);
      } else if (hashStr.startsWith('k=')) {
        encryptionKey = decodeURIComponent(hashStr.slice(2));
      }
    }
  } catch {
    // Ignore URL parse errors
  }

  // 2. Fallback regex extraction if roomCode was not resolved via URL
  if (!roomCode) {
    if (trimmed.includes('room=')) {
      const match = trimmed.match(/[?&]room=([A-Za-z0-9]+)/i);
      if (match && match[1]) {
        roomCode = match[1].toUpperCase().slice(0, 12);
      }
    } else {
      roomCode = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    }
  }

  // Fallback check for hash fragment if key was not parsed
  if (!encryptionKey && trimmed.includes('#k=')) {
    const parts = trimmed.split('#k=');
    if (parts[1]) {
      encryptionKey = decodeURIComponent(parts[1].split('&')[0]);
    }
  }

  return { roomCode, encryptionKey };
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

/**
 * Format timestamp to readable relative time (e.g., 'just now', '5m ago')
 */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Format timestamp to readable time
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format timestamp to readable date + time
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Generate a random 6-character room ID
 */
export function generateRoomId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Generate a random user ID
 */
export function generateUserId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  } catch {
    return false;
  }
}

/**
 * Validate room ID format (2 to 12 alphanumeric characters)
 */
export function isValidRoomId(roomId: string): boolean {
  return /^[A-Z0-9]{2,12}$/.test(roomId);
}

/**
 * Validate file for upload
 */
export const BLOCKED_EXTS = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.msi', '.hta', '.sh', '.ps1'];
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function validateFile(file: { name: string; size: number }): { valid: boolean; error?: string } {
  if (!file) return { valid: false, error: 'No file provided' };
  if (file.size > MAX_FILE_SIZE) return { valid: false, error: 'File exceeds 50 MB limit' };
  const ext = file.name.toLowerCase();
  if (BLOCKED_EXTS.some(e => ext.endsWith(e))) {
    return { valid: false, error: 'Executable and script files are not allowed' };
  }
  return { valid: true };
}

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Get syntax highlighter language from code or file extension
 */
export function detectCodeLanguage(code: string): string {
  const trimmed = code.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return 'json'; } catch { /* ignore */ }
  }
  if (trimmed.startsWith('<!DOCTYPE html>') || (trimmed.startsWith('<') && trimmed.includes('</'))) {
    return 'html';
  }
  if (trimmed.includes('SELECT ') || trimmed.includes('INSERT INTO ') || trimmed.includes('CREATE TABLE ')) {
    return 'sql';
  }
  if (trimmed.includes('import React') || trimmed.includes('export default function') || trimmed.includes('const [') || trimmed.includes('interface ')) {
    return 'typescript';
  }
  if (trimmed.includes('def ') || trimmed.includes('import ') && trimmed.includes(':') && !trimmed.includes('{')) {
    return 'python';
  }
  if (trimmed.startsWith('#!/bin/bash') || trimmed.startsWith('curl ') || trimmed.startsWith('npm ') || trimmed.startsWith('git ')) {
    return 'bash';
  }
  return 'text';
}

/**
 * Deterministic high-contrast avatar color generator based on full-string hashing.
 * Avoids collisions where different users starting with the same prefix receive identical colors.
 */
export function getUserAvatarColor(userId: string): { bg: string; text: string; border: string } {
  if (!userId) {
    return { bg: 'hsl(217, 75%, 50%)', text: '#ffffff', border: 'hsl(217, 85%, 65%)' };
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue}, 68%, 46%)`,
    text: '#ffffff',
    border: `hsl(${hue}, 75%, 62%)`,
  };
}

/**
 * Ensures unique file names inside a batch zip archive.
 * Appends standard (1), (2) counters so identical filenames are never silently overwritten.
 */
export function getUniqueZipFileName(fileName: string, existingNames: Set<string>): string {
  const safeName = fileName.trim() || `file-${Date.now()}`;
  if (!existingNames.has(safeName)) {
    existingNames.add(safeName);
    return safeName;
  }

  const lastDot = safeName.lastIndexOf('.');
  const baseName = lastDot > 0 ? safeName.slice(0, lastDot) : safeName;
  const ext = lastDot > 0 ? safeName.slice(lastDot) : '';

  let counter = 1;
  let candidate = `${baseName} (${counter})${ext}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${baseName} (${counter})${ext}`;
  }
  existingNames.add(candidate);
  return candidate;
}

export interface RawParticipant {
  userId: string;
  userName?: string;
  joined?: number;
}

export interface DisambiguatedParticipant {
  userId: string;
  userName: string;
  displayName: string;
  joined: number;
  isMe: boolean;
  color: { bg: string; text: string; border: string };
}

/**
 * Disambiguates peer names in a room when duplicate display names occur.
 * Local user receives '(You)', while colliding peer names receive a short distinct tag '#<ID>'.
 */
export function disambiguateParticipants(
  rawList: RawParticipant[],
  myUserId: string
): DisambiguatedParticipant[] {
  // Deduplicate by userId
  const uniqueMap = new Map<string, RawParticipant>();
  for (const item of rawList) {
    if (item.userId) {
      if (!uniqueMap.has(item.userId) || (item.joined && (uniqueMap.get(item.userId)!.joined || 0) < item.joined)) {
        uniqueMap.set(item.userId, item);
      }
    }
  }

  // Count occurrences of each normalized name
  const nameCounts = new Map<string, number>();
  for (const item of uniqueMap.values()) {
    const norm = (item.userName?.trim() || 'Anonymous').toLowerCase();
    nameCounts.set(norm, (nameCounts.get(norm) || 0) + 1);
  }

  const result: DisambiguatedParticipant[] = [];
  for (const item of uniqueMap.values()) {
    const isMe = item.userId === myUserId;
    const cleanName = item.userName?.trim() || (isMe ? 'You' : 'Anonymous');
    const norm = cleanName.toLowerCase();
    const hasCollision = (nameCounts.get(norm) || 0) > 1;

    let displayName = cleanName;
    if (isMe) {
      displayName = `${cleanName === 'You' ? 'You' : `${cleanName} (You)`}`;
    } else if (hasCollision) {
      const tag = item.userId.slice(-4).toUpperCase();
      displayName = `${cleanName} #${tag}`;
    }

    result.push({
      userId: item.userId,
      userName: cleanName,
      displayName,
      joined: item.joined || Date.now(),
      isMe,
      color: getUserAvatarColor(item.userId),
    });
  }

  // Current user first, then by join time
  return result.sort((a, b) => {
    if (a.isMe) return -1;
    if (b.isMe) return 1;
    return a.joined - b.joined;
  });
}

/**
 * Formats a sender display name with (You) attribution and collision avoidance.
 */
export function formatSenderDisplayName(
  senderId: string,
  rawName: string | undefined,
  myUserId: string,
  participantMap?: Map<string, DisambiguatedParticipant>
): string {
  if (senderId === myUserId) {
    const name = rawName?.trim() || 'You';
    return name === 'You' ? 'You' : `${name} (You)`;
  }
  if (participantMap && participantMap.has(senderId)) {
    return participantMap.get(senderId)!.displayName;
  }
  const name = rawName?.trim() || 'Anonymous';
  return name;
}

