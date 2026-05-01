/**
 * Global constants for the application
 */

// ============================================================================
// APP CONSTANTS
// ============================================================================

export const APP_VERSION = '2.0.0-ultimate';
export const APP_NAME = 'SyncPadIO';

// ============================================================================
// LIMITS
// ============================================================================

export const LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_TEXT_LENGTH: 100000, // 100KB
  MAX_ROOM_ID_LENGTH: 12,
  MIN_ROOM_ID_LENGTH: 6,
  MAX_SNIPPETS: 1000,
  MAX_FILES: 500,
  MAX_HISTORY: 20,
  UPLOAD_TIMEOUT: 30000, // 30 seconds
};

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

export const PATTERNS = {
  ROOM_ID: /^[A-Z0-9]{6,12}$/,
  VALID_ROOM_ID: (id: string) => PATTERNS.ROOM_ID.test(id),
};

// ============================================================================
// FILE TYPES
// ============================================================================

export const ALLOWED_FILE_TYPES = [
  'text/plain',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

export const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'jsx',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  sh: 'bash',
  bash: 'bash',
  json: 'json',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  vue: 'vue',
};

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

export const KEYBOARD_SHORTCUTS = {
  SEND: 'Ctrl+Enter', // or Cmd+Enter on Mac
  UNDO: 'Ctrl+Z', // or Cmd+Z on Mac
  REDO: 'Ctrl+Y', // or Cmd+Y on Mac
  COPY: 'Ctrl+C', // or Cmd+C on Mac
  PASTE: 'Ctrl+V', // or Cmd+V on Mac
  SELECT_ALL: 'Ctrl+A', // or Cmd+A on Mac
};

// ============================================================================
// UI CONSTANTS
// ============================================================================

export const UI = {
  TOAST_DURATION_SUCCESS: 3000,
  TOAST_DURATION_ERROR: 4000,
  TOAST_DURATION_INFO: 3000,
  TOAST_DURATION_WARNING: 3000,
  DEBOUNCE_DELAY: 500,
  ANIMATION_DURATION: 300,
  QR_CODE_SIZE: 180,
  MAX_DISPLAY_NAME_LENGTH: 50,
};

// ============================================================================
// COLORS & THEMES
// ============================================================================

export const COLORS = {
  PRIMARY: '#2563eb', // blue-600
  SUCCESS: '#16a34a', // green-600
  ERROR: '#dc2626', // red-600
  WARNING: '#ea580c', // orange-600
  INFO: '#0284c7', // blue-600
};

// ============================================================================
// ERROR MESSAGES
// ============================================================================

export const ERROR_MESSAGES = {
  INVALID_ROOM_ID: 'Invalid room ID format',
  INVALID_FILE: 'Invalid file',
  FILE_TOO_LARGE: 'File exceeds size limit',
  FILE_NOT_ALLOWED: 'File type not allowed',
  ROOM_NOT_FOUND: 'Room not found',
  CONNECTION_FAILED: 'Failed to connect to server',
  OPERATION_FAILED: 'Operation failed',
  OFFLINE: 'You are offline',
  UPLOAD_FAILED: 'Upload failed',
  CLIPBOARD_FAILED: 'Failed to copy to clipboard',
};

// ============================================================================
// SUCCESS MESSAGES
// ============================================================================

export const SUCCESS_MESSAGES = {
  COPIED: 'Copied to clipboard!',
  SNIPPET_ADDED: 'Snippet added!',
  SNIPPET_DELETED: 'Snippet deleted!',
  FILE_UPLOADED: 'File uploaded!',
  FILE_DELETED: 'File deleted!',
  ROOM_CREATED: 'Room created!',
  ROOM_JOINED: 'Room joined!',
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

export const STORAGE_KEYS = {
  THEME: 'theme',
  RECENT_ROOMS: 'recent_rooms',
  USER_ID: 'user_id',
  LAST_SNIPPET: 'last_snippet',
  SETTINGS: 'settings',
};

// ============================================================================
// ROUTES (if using React Router)
// ============================================================================

export const ROUTES = {
  HOME: '/',
  ROOM: '/room/:roomId',
  SETTINGS: '/settings',
  ABOUT: '/about',
};

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const API = {
  BASE_URL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',
  UPLOAD: '/upload',
  DOWNLOAD: '/download',
  HEALTH: '/',
};

// ============================================================================
// SUPABASE
// ============================================================================

export const SUPABASE = {
  TABLES: {
    SNIPPETS: 'snippets',
    FILES: 'files',
  },
  BUCKETS: {
    UPLOADS: 'uploads',
  },
};
