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
