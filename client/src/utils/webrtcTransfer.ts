import { P2PTransfer, WebRTCSignalPayload } from '../types';

export const CHUNK_SIZE = 64 * 1024; // 64 KiB SCTP network payload
const BLOCK_SIZE = 1024 * 1024; // 1 MB disk read buffer for blazing fast I/O
const BUFFERED_LOW_THRESHOLD = 256 * 1024; // 256 KiB native backpressure threshold
const MAX_BUFFERED_AMOUNT = 512 * 1024; // 512 KiB maximum queued in socket
const CONNECTION_TIMEOUT_MS = 15000; // 15 seconds watchdog

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

interface QueuedSendItem {
  transferId: string;
  file: File;
  targetUserId?: string;
}

interface ReceiveBufferState {
  chunks: ArrayBuffer[];
  receivedBytes: number;
  lastTime: number;
  meta: {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    senderName?: string;
    timestamp?: number;
  };
}

export class WebRTCTransferService {
  private myUserId: string;
  private senderName = 'You';
  private signalSender: ((signal: WebRTCSignalPayload) => void) | null = null;

  // Persistent reusable WebRTC pipe for instant zero-latency file streams
  private persistentPC: RTCPeerConnection | null = null;
  private persistentDC: RTCDataChannel | null = null;

  // Active transfers and buffers
  private transfers: Map<string, P2PTransfer> = new Map();
  private receiveBuffers: Map<string, ReceiveBufferState> = new Map();
  private activeIncomingTransferId: string | null = null;

  private listeners: Set<(transfers: P2PTransfer[]) => void> = new Set();
  private abortedTransfers: Set<string> = new Set();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private connectionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Send queue
  private sendQueue: QueuedSendItem[] = [];
  private activeSenderTransferId: string | null = null;
  private isConnectingPipe = false;

  constructor(myUserId: string) {
    this.myUserId = myUserId;
  }

  public setSenderName(name: string): void {
    if (name && name.trim()) {
      this.senderName = name.trim();
    }
  }

  public setSignalSender(sender: (signal: WebRTCSignalPayload) => void): void {
    this.signalSender = sender;
  }

  public subscribe(listener: (transfers: P2PTransfer[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getAllTransfers());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getAllTransfers(): P2PTransfer[] {
    return Array.from(this.transfers.values());
  }

  private notify(): void {
    const list = this.getAllTransfers();
    this.listeners.forEach((fn) => fn(list));
  }

  private updateTransfer(id: string, updates: Partial<P2PTransfer>): void {
    const existing = this.transfers.get(id);
    if (!existing) return;
    // Prevent overriding a completed transfer with failed or cancelled from channel closure
    if (existing.status === 'completed' && (updates.status === 'failed' || updates.status === 'cancelled')) {
      return;
    }
    this.transfers.set(id, { ...existing, ...updates });
    this.notify();
  }

  private clearConnectionTimeout(key: string): void {
    const t = this.connectionTimeouts.get(key);
    if (t) {
      clearTimeout(t);
      this.connectionTimeouts.delete(key);
    }
  }

  private async flushPendingCandidates(transferId: string, pc: RTCPeerConnection): Promise<void> {
    const buffered = this.pendingCandidates.get(transferId);
    if (buffered && buffered.length > 0) {
      for (const cand of buffered) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[WebRTC Candidate Notice]', e);
        }
      }
      this.pendingCandidates.delete(transferId);
    }
  }

  /**
   * Initiate sending a file directly to peers via WebRTC DataChannel (enqueued)
   */
  public async sendFile(file: File, targetUserId?: string): Promise<string> {
    const transferId = 'p2p_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

    const initialTransfer: P2PTransfer = {
      id: transferId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      transferredBytes: 0,
      progress: 0,
      speed: 0,
      status: 'queued',
      direction: 'send',
      senderName: this.senderName,
      timestamp: Date.now(),
    };

    this.transfers.set(transferId, initialTransfer);
    this.notify();

    // Push into the high-speed sequential queue
    this.sendQueue.push({ transferId, file, targetUserId });
    this.processNextInSendQueue();

    return transferId;
  }

  /**
   * Send multiple files in batch
   */
  public async sendFiles(files: File[] | FileList, targetUserId?: string): Promise<string[]> {
    const list = Array.from(files);
    const ids: string[] = [];
    for (const file of list) {
      const id = await this.sendFile(file, targetUserId);
      ids.push(id);
    }
    return ids;
  }

  /**
   * Process next file in send queue over the high-speed WebRTC data channel
   */
  private async processNextInSendQueue(): Promise<void> {
    if (this.activeSenderTransferId) return; // Currently streaming a file
    if (this.sendQueue.length === 0) return;

    const nextItem = this.sendQueue[0];
    if (!nextItem) return;

    if (this.abortedTransfers.has(nextItem.transferId)) {
      this.sendQueue.shift();
      this.processNextInSendQueue();
      return;
    }

    // 1. If persistent DataChannel is already open, stream IMMEDIATELY (0ms handshake delay)
    if (this.persistentDC && this.persistentDC.readyState === 'open') {
      this.sendQueue.shift();
      this.activeSenderTransferId = nextItem.transferId;
      this.updateTransfer(nextItem.transferId, { status: 'transferring' });
      await this.streamFileOverChannel(nextItem.transferId, nextItem.file, this.persistentDC);
      return;
    }

    // 2. Otherwise, establish persistent WebRTC pipe if not already connecting
    if (!this.isConnectingPipe) {
      this.isConnectingPipe = true;
      this.updateTransfer(nextItem.transferId, { status: 'connecting' });
      await this.establishWebRTCPipe(nextItem.transferId, nextItem.targetUserId);
    }
  }

  /**
   * Establishes a single high-speed WebRTC DataChannel connection
   */
  private async establishWebRTCPipe(transferId: string, targetUserId?: string): Promise<void> {
    if (typeof window === 'undefined' || !('RTCPeerConnection' in window)) {
      this.updateTransfer(transferId, {
        status: 'failed',
        error: 'WebRTC is not supported in this browser environment',
      });
      this.isConnectingPipe = false;
      this.sendQueue.shift();
      this.processNextInSendQueue();
      return;
    }

    // Watchdog timer for connection handshake
    const timeout = setTimeout(() => {
      if (this.isConnectingPipe) {
        console.warn(`[WebRTC] Peer handshake timed out`);
        this.clearConnectionTimeout(transferId);
        this.isConnectingPipe = false;
        this.updateTransfer(transferId, {
          status: 'failed',
          error: 'Connection timed out. Check that peer is online and connected to room.',
        });
        this.sendQueue.shift();
        this.processNextInSendQueue();
      }
    }, CONNECTION_TIMEOUT_MS);
    this.connectionTimeouts.set(transferId, timeout);

    try {
      const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      this.persistentPC = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalSender) {
          this.signalSender({
            type: 'candidate',
            transferId,
            fromUserId: this.myUserId,
            toUserId: targetUserId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      const dc = pc.createDataChannel('syncpad_highspeed_p2p', { ordered: true });
      dc.binaryType = 'arraybuffer';
      dc.bufferedAmountLowThreshold = BUFFERED_LOW_THRESHOLD;
      this.persistentDC = dc;

      dc.onopen = async () => {
        this.clearConnectionTimeout(transferId);
        this.isConnectingPipe = false;
        // Pipe is open! Start streaming queued transfers
        this.processNextInSendQueue();
      };

      dc.onerror = (e) => {
        console.warn('[WebRTC DataChannel Notice]', e);
      };

      dc.onclose = () => {
        if (this.persistentDC === dc) {
          this.persistentDC = null;
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.signalSender) {
        this.signalSender({
          type: 'offer',
          transferId,
          fromUserId: this.myUserId,
          toUserId: targetUserId,
          sdp: offer,
          fileMeta: {
            id: transferId,
            name: this.sendQueue[0]?.file.name || 'stream',
            size: this.sendQueue[0]?.file.size || 0,
            type: this.sendQueue[0]?.file.type || 'application/octet-stream',
            totalChunks: 0,
          },
        });
      }
    } catch (err) {
      this.clearConnectionTimeout(transferId);
      this.isConnectingPipe = false;
      const msg = err instanceof Error ? err.message : 'WebRTC initialization failed';
      this.updateTransfer(transferId, { status: 'failed', error: msg });
      this.sendQueue.shift();
      this.processNextInSendQueue();
    }
  }

  /**
   * Handle incoming WebRTC signaling message
   */
  public async handleSignal(signal: WebRTCSignalPayload): Promise<void> {
    if (signal.fromUserId === this.myUserId) return;
    if (signal.toUserId && signal.toUserId !== this.myUserId) return;

    const { type, transferId, sdp, candidate } = signal;

    if (type === 'cancel') {
      this.cancelTransfer(transferId, false);
      return;
    }

    if (type === 'offer' && sdp) {
      await this.handleIncomingOffer(signal);
      return;
    }

    if (type === 'answer' && sdp) {
      const pc = this.persistentPC;
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await this.flushPendingCandidates(transferId, pc);
      }
      return;
    }

    if (type === 'candidate' && candidate) {
      const pc = this.persistentPC;
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC Candidate Notice]', e);
        }
      } else {
        const list = this.pendingCandidates.get(transferId) || [];
        list.push(candidate);
        this.pendingCandidates.set(transferId, list);
      }
    }
  }

  private async handleIncomingOffer(signal: WebRTCSignalPayload): Promise<void> {
    const { transferId, sdp, fromUserId } = signal;
    if (!sdp) return;

    // Clean up existing closed connection if any
    if (this.persistentPC && this.persistentPC.connectionState === 'closed') {
      this.persistentPC = null;
      this.persistentDC = null;
    }

    try {
      const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      this.persistentPC = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate && this.signalSender) {
          this.signalSender({
            type: 'candidate',
            transferId,
            fromUserId: this.myUserId,
            toUserId: fromUserId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dc.binaryType = 'arraybuffer';
        dc.bufferedAmountLowThreshold = BUFFERED_LOW_THRESHOLD;
        this.persistentDC = dc;

        dc.onmessage = (msgEvent) => {
          this.handleIncomingDataChannelMessage(msgEvent.data);
        };

        dc.onclose = () => {
          if (this.persistentDC === dc) {
            this.persistentDC = null;
          }
        };
      };

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushPendingCandidates(transferId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (this.signalSender) {
        this.signalSender({
          type: 'answer',
          transferId,
          fromUserId: this.myUserId,
          toUserId: fromUserId,
          sdp: answer,
        });
      }
    } catch (err) {
      console.warn('[WebRTC Receiver Offer Error]', err);
    }
  }

  /**
   * Processes incoming data channel messages (framing protocol)
   */
  private handleIncomingDataChannelMessage(data: unknown): void {
    // 1. Control frame (JSON header, completion, or cancel)
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'file-header') {
          const { id, name, size, mimeType, senderName, timestamp } = msg;
          this.activeIncomingTransferId = id;
          this.receiveBuffers.set(id, {
            chunks: [],
            receivedBytes: 0,
            lastTime: Date.now(),
            meta: { id, name, size, mimeType, senderName, timestamp },
          });

          const incomingTransfer: P2PTransfer = {
            id,
            fileName: name,
            fileSize: size,
            fileType: mimeType || 'application/octet-stream',
            transferredBytes: 0,
            progress: 0,
            speed: 0,
            status: 'transferring',
            direction: 'receive',
            senderName: senderName || 'Peer',
            timestamp: timestamp || Date.now(),
          };

          this.transfers.set(id, incomingTransfer);
          this.notify();
          return;
        }

        if (msg.type === 'file-complete') {
          const { id } = msg;
          this.finalizeReceivedFile(id);
          return;
        }

        if (msg.type === 'cancel') {
          const { id } = msg;
          this.receiveBuffers.delete(id);
          this.updateTransfer(id, { status: 'cancelled' });
          if (this.activeIncomingTransferId === id) {
            this.activeIncomingTransferId = null;
          }
          return;
        }
      } catch {
        // Ignored
      }
      return;
    }

    // 2. Binary frame (raw chunk)
    if (data instanceof ArrayBuffer) {
      const activeId = this.activeIncomingTransferId;
      if (!activeId) return;

      const bufferState = this.receiveBuffers.get(activeId);
      if (!bufferState) return;

      bufferState.chunks.push(data);
      bufferState.receivedBytes += data.byteLength;

      const now = Date.now();
      const elapsed = (now - bufferState.lastTime) / 1000;
      let speed = 0;
      if (elapsed > 0.3) {
        speed = Math.round(data.byteLength / elapsed);
        bufferState.lastTime = now;
      }

      const progress = Math.min(100, Math.round((bufferState.receivedBytes / bufferState.meta.size) * 100));
      this.updateTransfer(activeId, {
        status: 'transferring',
        transferredBytes: bufferState.receivedBytes,
        progress,
        speed,
      });

      // Auto-finalize if received total bytes
      if (bufferState.receivedBytes >= bufferState.meta.size) {
        this.finalizeReceivedFile(activeId);
      }
    }
  }

  private finalizeReceivedFile(transferId: string): void {
    const bufferState = this.receiveBuffers.get(transferId);
    if (!bufferState) return;

    const { meta } = bufferState;
    const blob = new Blob(bufferState.chunks, { type: meta.mimeType });
    const downloadUrl = URL.createObjectURL(blob);

    this.updateTransfer(transferId, {
      status: 'completed',
      transferredBytes: meta.size,
      progress: 100,
      speed: 0,
      blob,
      downloadUrl,
      timestamp: meta.timestamp || Date.now(),
      senderName: meta.senderName || 'Peer',
    });

    this.receiveBuffers.delete(transferId);
    if (this.activeIncomingTransferId === transferId) {
      this.activeIncomingTransferId = null;
    }
  }

  /**
   * High-speed streaming engine: 1MB block buffering + native socket backpressure
   */
  private async streamFileOverChannel(
    transferId: string,
    file: File,
    dc: RTCDataChannel
  ): Promise<void> {
    // 1. Send header control frame
    try {
      dc.send(
        JSON.stringify({
          type: 'file-header',
          id: transferId,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          senderName: this.senderName,
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      console.warn('[WebRTC Stream Header Error]', e);
      this.updateTransfer(transferId, { status: 'failed', error: 'Failed to send file header' });
      this.activeSenderTransferId = null;
      this.processNextInSendQueue();
      return;
    }

    let offset = 0;
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    // 2. Stream binary data in 1MB disk read blocks, sending 64KB network frames
    while (offset < file.size) {
      if (this.abortedTransfers.has(transferId)) return;

      const blockEnd = Math.min(offset + BLOCK_SIZE, file.size);
      const blockSlice = file.slice(offset, blockEnd);
      const blockBuffer = await blockSlice.arrayBuffer();

      let blockOffset = 0;
      while (blockOffset < blockBuffer.byteLength) {
        if (this.abortedTransfers.has(transferId)) return;

        // Native backpressure check: wait for native socket to drain
        if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          await new Promise<void>((resolve) => {
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null;
              resolve();
            };
          });
        }

        const chunkEnd = Math.min(blockOffset + CHUNK_SIZE, blockBuffer.byteLength);
        const chunk = blockBuffer.slice(blockOffset, chunkEnd);
        dc.send(chunk);

        blockOffset += chunk.byteLength;
        offset += chunk.byteLength;
        bytesSinceLast += chunk.byteLength;

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        let speed = 0;
        if (elapsed > 0.3) {
          speed = Math.round(bytesSinceLast / elapsed);
          lastTime = now;
          bytesSinceLast = 0;
        }

        const progress = Math.min(100, Math.round((offset / file.size) * 100));
        this.updateTransfer(transferId, {
          transferredBytes: offset,
          progress,
          speed,
        });
      }
    }

    // 3. Send complete control frame
    if (dc.readyState === 'open') {
      try {
        dc.send(JSON.stringify({ type: 'file-complete', id: transferId }));
      } catch {
        // Ignored
      }
    }

    let senderBlobUrl: string | undefined;
    try {
      if (typeof URL !== 'undefined' && URL.createObjectURL) {
        senderBlobUrl = URL.createObjectURL(file);
      }
    } catch {
      // Ignored
    }

    this.updateTransfer(transferId, {
      status: 'completed',
      transferredBytes: file.size,
      progress: 100,
      speed: 0,
      blob: file,
      downloadUrl: senderBlobUrl,
    });

    // Advance queue immediately over the same persistent channel!
    this.activeSenderTransferId = null;
    setTimeout(() => this.processNextInSendQueue(), 20);
  }

  public cancelTransfer(transferId: string, notifyRemote = true): void {
    this.abortedTransfers.add(transferId);
    this.clearConnectionTimeout(transferId);

    // Remove from send queue if queued
    this.sendQueue = this.sendQueue.filter((item) => item.transferId !== transferId);

    if (notifyRemote && this.persistentDC && this.persistentDC.readyState === 'open') {
      try {
        this.persistentDC.send(JSON.stringify({ type: 'cancel', id: transferId }));
      } catch {
        // Ignored
      }
    }

    this.receiveBuffers.delete(transferId);
    if (this.activeIncomingTransferId === transferId) {
      this.activeIncomingTransferId = null;
    }

    this.updateTransfer(transferId, { status: 'cancelled' });

    if (this.activeSenderTransferId === transferId) {
      this.activeSenderTransferId = null;
      setTimeout(() => this.processNextInSendQueue(), 20);
    }
  }

  public clearTransfer(transferId: string): void {
    this.clearConnectionTimeout(transferId);
    this.pendingCandidates.delete(transferId);
    this.sendQueue = this.sendQueue.filter((item) => item.transferId !== transferId);

    const existing = this.transfers.get(transferId);
    if (existing?.downloadUrl) {
      try {
        URL.revokeObjectURL(existing.downloadUrl);
      } catch {
        // Ignored
      }
    }
    this.transfers.delete(transferId);
    this.notify();
  }

  public clearAllCompletedTransfers(): void {
    const idsToClear: string[] = [];
    this.transfers.forEach((t, id) => {
      if (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') {
        idsToClear.push(id);
      }
    });
    idsToClear.forEach((id) => this.clearTransfer(id));
  }

  public cleanup(): void {
    this.connectionTimeouts.forEach((t) => clearTimeout(t));
    this.connectionTimeouts.clear();
    this.sendQueue = [];
    this.activeSenderTransferId = null;
    this.isConnectingPipe = false;

    if (this.persistentDC) {
      try {
        this.persistentDC.close();
      } catch {
        // Ignored
      }
      this.persistentDC = null;
    }

    if (this.persistentPC) {
      try {
        this.persistentPC.close();
      } catch {
        // Ignored
      }
      this.persistentPC = null;
    }

    this.transfers.forEach((t) => {
      if (t.downloadUrl) {
        try {
          URL.revokeObjectURL(t.downloadUrl);
        } catch {
          // Ignored
        }
      }
    });

    this.transfers.clear();
    this.receiveBuffers.clear();
    this.listeners.clear();
    this.abortedTransfers.clear();
    this.pendingCandidates.clear();
  }
}
