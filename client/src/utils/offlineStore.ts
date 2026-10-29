import { Snippet, FileData } from '../types';

/**
 * SyncPadIO Offline Storage Engine (Local-First IndexedDB)
 * 
 * Provides transparent offline storage and pending sync queues
 * across Desktop, Mobile, and Tablet browsers.
 * Falls back gracefully to memory/localStorage if IndexedDB is disabled.
 */

const DB_NAME = 'syncpadio_offline_v1';
const DB_VERSION = 1;

interface CachedRoom {
  id: string;
  encryptionKey?: string;
  lastAccessed: number;
}

// In-memory fallback if IndexedDB is restricted or running in Node.js
const memoryFallback = {
  rooms: new Map<string, CachedRoom>(),
  snippets: new Map<string, Snippet[]>(),
  files: new Map<string, FileData[]>(),
  pendingSnippets: new Map<string, Snippet>(),
};

function isIDBAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIDBAvailable()) {
      return reject(new Error('IndexedDB not available'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('rooms')) {
        db.createObjectStore('rooms', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('snippets')) {
        const snippetStore = db.createObjectStore('snippets', { keyPath: 'id' });
        snippetStore.createIndex('room_id', 'room_id', { unique: false });
        snippetStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains('files')) {
        const fileStore = db.createObjectStore('files', { keyPath: 'id' });
        fileStore.createIndex('room_id', 'room_id', { unique: false });
      }

      if (!db.objectStoreNames.contains('pending_snippets')) {
        db.createObjectStore('pending_snippets', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save room metadata offline
 */
export async function saveRoomOffline(roomId: string, encryptionKey?: string): Promise<void> {
  const record: CachedRoom = {
    id: roomId.toUpperCase(),
    encryptionKey,
    lastAccessed: Date.now(),
  };

  if (!isIDBAvailable()) {
    memoryFallback.rooms.set(record.id, record);
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction('rooms', 'readwrite');
    tx.objectStore('rooms').put(record);
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch (err) {
    memoryFallback.rooms.set(record.id, record);
  }
}

/**
 * Get cached room metadata
 */
export async function getCachedRoom(roomId: string): Promise<CachedRoom | null> {
  const cleanId = roomId.toUpperCase();
  if (!isIDBAvailable()) {
    return memoryFallback.rooms.get(cleanId) || null;
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('rooms', 'readonly');
      const req = tx.objectStore('rooms').get(cleanId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return memoryFallback.rooms.get(cleanId) || null;
  }
}

/**
 * Cache snippets offline for a room
 */
export async function saveSnippetsOffline(roomId: string, snippets: Snippet[]): Promise<void> {
  const cleanId = roomId.toUpperCase();
  if (!isIDBAvailable()) {
    memoryFallback.snippets.set(cleanId, snippets);
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction('snippets', 'readwrite');
    const store = tx.objectStore('snippets');

    for (const s of snippets) {
      store.put({
        ...s,
        room_id: cleanId,
        sync_status: s.sync_status || 'synced',
      });
    }

    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch {
    memoryFallback.snippets.set(cleanId, snippets);
  }
}

/**
 * Get cached snippets for an active room
 */
export async function getCachedSnippets(roomId: string): Promise<Snippet[]> {
  const cleanId = roomId.toUpperCase();
  if (!isIDBAvailable()) {
    return memoryFallback.snippets.get(cleanId) || [];
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('snippets', 'readonly');
      const index = tx.objectStore('snippets').index('room_id');
      const req = index.getAll(cleanId);
      req.onsuccess = () => {
        const results: Snippet[] = req.result || [];
        results.sort((a, b) => a.timestamp - b.timestamp);
        resolve(results);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return memoryFallback.snippets.get(cleanId) || [];
  }
}

/**
 * Queue a new snippet created offline for background sync
 */
export async function savePendingSnippetOffline(snippet: Snippet): Promise<void> {
  const item: Snippet = {
    ...snippet,
    sync_status: 'pending',
  };

  if (!isIDBAvailable()) {
    memoryFallback.pendingSnippets.set(item.id, item);
    const existing = memoryFallback.snippets.get(item.room_id || '') || [];
    memoryFallback.snippets.set(item.room_id || '', [...existing, item]);
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction(['snippets', 'pending_snippets'], 'readwrite');
    tx.objectStore('snippets').put(item);
    tx.objectStore('pending_snippets').put(item);
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch {
    memoryFallback.pendingSnippets.set(item.id, item);
  }
}

/**
 * Get all pending snippets waiting to be synced to Supabase
 */
export async function getPendingSnippets(roomId?: string): Promise<Snippet[]> {
  if (!isIDBAvailable()) {
    const all = Array.from(memoryFallback.pendingSnippets.values());
    return roomId ? all.filter(s => s.room_id === roomId.toUpperCase()) : all;
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_snippets', 'readonly');
      const req = tx.objectStore('pending_snippets').getAll();
      req.onsuccess = () => {
        const list: Snippet[] = req.result || [];
        resolve(roomId ? list.filter(s => s.room_id === roomId.toUpperCase()) : list);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    const all = Array.from(memoryFallback.pendingSnippets.values());
    return roomId ? all.filter(s => s.room_id === roomId.toUpperCase()) : all;
  }
}

/**
 * Mark a pending snippet as synced with the server
 */
export async function resolvePendingSnippet(tempId: string, serverSnippet: Snippet): Promise<void> {
  if (!isIDBAvailable()) {
    memoryFallback.pendingSnippets.delete(tempId);
    if (serverSnippet.room_id) {
      const existing = memoryFallback.snippets.get(serverSnippet.room_id) || [];
      const updated = existing.map(s => s.id === tempId ? { ...serverSnippet, sync_status: 'synced' as const } : s);
      memoryFallback.snippets.set(serverSnippet.room_id, updated);
    }
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction(['snippets', 'pending_snippets'], 'readwrite');
    tx.objectStore('pending_snippets').delete(tempId);
    // Remove temporary client ID and add verified server ID
    tx.objectStore('snippets').delete(tempId);
    tx.objectStore('snippets').put({ ...serverSnippet, sync_status: 'synced' });
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch {
    memoryFallback.pendingSnippets.delete(tempId);
  }
}

/**
 * Save files metadata offline
 */
export async function saveFilesOffline(roomId: string, files: FileData[]): Promise<void> {
  const cleanId = roomId.toUpperCase();
  if (!isIDBAvailable()) {
    memoryFallback.files.set(cleanId, files);
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction('files', 'readwrite');
    const store = tx.objectStore('files');
    for (const f of files) {
      store.put({ ...f, room_id: cleanId });
    }
    await new Promise((res, rej) => {
      tx.oncomplete = res;
      tx.onerror = rej;
    });
  } catch {
    memoryFallback.files.set(cleanId, files);
  }
}

/**
 * Get cached files for a room
 */
export async function getCachedFiles(roomId: string): Promise<FileData[]> {
  const cleanId = roomId.toUpperCase();
  if (!isIDBAvailable()) {
    return memoryFallback.files.get(cleanId) || [];
  }

  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const tx = db.transaction('files', 'readonly');
      const index = tx.objectStore('files').index('room_id');
      const req = index.getAll(cleanId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return memoryFallback.files.get(cleanId) || [];
  }
}

/**
 * Clear cached data for an expired or deleted room (Preserving Ephemerality)
 */
export async function clearRoomOffline(roomId: string): Promise<void> {
  const cleanId = roomId.toUpperCase();
  memoryFallback.rooms.delete(cleanId);
  memoryFallback.snippets.delete(cleanId);
  memoryFallback.files.delete(cleanId);

  if (!isIDBAvailable()) return;

  try {
    const db = await openDatabase();
    const tx = db.transaction(['rooms', 'snippets', 'files', 'pending_snippets'], 'readwrite');
    tx.objectStore('rooms').delete(cleanId);

    // Delete snippets for room
    const snipStore = tx.objectStore('snippets');
    const snipIndex = snipStore.index('room_id');
    const snipReq = snipIndex.getAllKeys(cleanId);
    snipReq.onsuccess = () => {
      for (const k of snipReq.result) snipStore.delete(k);
    };

    // Delete files for room
    const fileStore = tx.objectStore('files');
    const fileIndex = fileStore.index('room_id');
    const fileReq = fileIndex.getAllKeys(cleanId);
    fileReq.onsuccess = () => {
      for (const k of fileReq.result) fileStore.delete(k);
    };

    await new Promise((res) => { tx.oncomplete = res; });
  } catch {
    // Ignore cleanup error
  }
}
