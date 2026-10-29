/**
 * Global Type Definitions for SyncPadIO
 */

export interface Snippet {
  id: string;
  room_id?: string;
  text: string;
  sender_id: string;
  timestamp: number;
  sender_name?: string;
  sync_status?: 'synced' | 'pending' | 'failed';
}

export interface FileData {
  id: string;
  room_id?: string;
  name: string;
  size: number;
  url: string;
  timestamp: number;
  storage_path: string;
  uploader_name?: string;
}

export interface UploadItem {
  id: string;
  name: string;
  progress: number;
  done: boolean;
  error?: string;
  cancelled?: boolean;
}

export type ConnectionStatusType = 'connecting' | 'connected' | 'offline';
