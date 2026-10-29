import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveRoomOffline,
  getCachedRoom,
  saveSnippetsOffline,
  getCachedSnippets,
  savePendingSnippetOffline,
  getPendingSnippets,
  resolvePendingSnippet,
  saveFilesOffline,
  getCachedFiles,
  clearRoomOffline,
} from './offlineStore';
import { Snippet, FileData } from '../types';

describe('SyncPadIO Offline Storage Engine', () => {
  const roomId = 'OFFLINE01';

  beforeEach(async () => {
    await clearRoomOffline(roomId);
  });

  it('saves and retrieves room metadata offline', async () => {
    await saveRoomOffline(roomId, 'secret-key-123');
    const room = await getCachedRoom(roomId);
    expect(room).toBeDefined();
    expect(room?.id).toBe(roomId);
    expect(room?.encryptionKey).toBe('secret-key-123');
  });

  it('saves and retrieves cached snippets', async () => {
    const snippets: Snippet[] = [
      { id: 's1', text: 'Snippet 1', sender_id: 'u1', timestamp: 1000 },
      { id: 's2', text: 'Snippet 2', sender_id: 'u2', timestamp: 2000 },
    ];

    await saveSnippetsOffline(roomId, snippets);
    const cached = await getCachedSnippets(roomId);
    expect(cached.length).toBe(2);
    expect(cached[0].text).toBe('Snippet 1');
    expect(cached[1].text).toBe('Snippet 2');
  });

  it('queues pending snippets and resolves them when online', async () => {
    const pendingSnippet: Snippet = {
      id: 'opt-temp-1',
      room_id: roomId,
      text: 'ENC:v2:offline-secret',
      sender_id: 'local-user',
      timestamp: Date.now(),
      sync_status: 'pending',
    };

    await savePendingSnippetOffline(pendingSnippet);

    const pendingList = await getPendingSnippets(roomId);
    expect(pendingList.length).toBe(1);
    expect(pendingList[0].id).toBe('opt-temp-1');

    // Simulate online reconnection resolution
    const serverSnippet: Snippet = {
      ...pendingSnippet,
      id: 'real-uuid-999',
      sync_status: 'synced',
    };

    await resolvePendingSnippet('opt-temp-1', serverSnippet);

    const remainingPending = await getPendingSnippets(roomId);
    expect(remainingPending.length).toBe(0);
  });

  it('caches and retrieves file metadata', async () => {
    const files: FileData[] = [
      {
        id: 'f1',
        name: 'document.pdf',
        size: 1024,
        url: 'https://supabase.co/storage/v1/f1',
        timestamp: Date.now(),
        storage_path: 'path/f1',
      },
    ];

    await saveFilesOffline(roomId, files);
    const cached = await getCachedFiles(roomId);
    expect(cached.length).toBe(1);
    expect(cached[0].name).toBe('document.pdf');
  });

  it('wipes room data on clearRoomOffline to preserve ephemerality', async () => {
    await saveRoomOffline(roomId, 'key');
    await saveSnippetsOffline(roomId, [{ id: 's1', text: 'T', sender_id: 'u', timestamp: 1 }]);
    await clearRoomOffline(roomId);

    const room = await getCachedRoom(roomId);
    const snippets = await getCachedSnippets(roomId);

    expect(room).toBeNull();
    expect(snippets.length).toBe(0);
  });
});

