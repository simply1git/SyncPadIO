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
  is_encrypted?: boolean;
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

export interface P2PTransfer {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  transferredBytes: number;
  progress: number; // 0 - 100
  speed: number; // bytes per second
  status: 'connecting' | 'transferring' | 'completed' | 'failed' | 'cancelled';
  direction: 'send' | 'receive';
  senderName?: string;
  blob?: Blob;
  downloadUrl?: string;
  error?: string;
}

export interface WebRTCSignalPayload {
  type: 'offer' | 'answer' | 'candidate' | 'cancel' | 'request';
  transferId: string;
  fromUserId: string;
  toUserId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  fileMeta?: {
    id: string;
    name: string;
    size: number;
    type: string;
    totalChunks: number;
  };
}

export interface PasskeyRecord {
  id: string; // base64url encoded credential ID
  createdAt: number;
  deviceName?: string;
}

