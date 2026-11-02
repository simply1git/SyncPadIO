import { P2PTransfer, WebRTCSignalPayload } from '../types';

export const CHUNK_SIZE = 64 * 1024; // 64 KiB
const MAX_BUFFERED_AMOUNT = 256 * 1024; // 256 KiB backpressure threshold
const CONNECTION_TIMEOUT_MS = 15000; // 15 seconds connection timeout

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

export class WebRTCTransferService {
  private myUserId: string;
  private signalSender: ((signal: WebRTCSignalPayload) => void) | null = null;
  private activePeerConnections: Map<string, RTCPeerConnection> = new Map();
  private activeDataChannels: Map<string, RTCDataChannel> = new Map();
  private transfers: Map<string, P2PTransfer> = new Map();
  private receiveBuffers: Map<string, { chunks: ArrayBuffer[]; receivedBytes: number; lastTime: number }> = new Map();
  private listeners: Set<(transfers: P2PTransfer[]) => void> = new Set();
  private abortedTransfers: Set<string> = new Set();

  // WebRTC reliability: candidate buffering, timeouts, and sequential queueing
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private connectionTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private sendQueue: QueuedSendItem[] = [];
  private activeSenderTransferId: string | null = null;

  constructor(myUserId: string) {
    this.myUserId = myUserId;
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
    this.transfers.set(id, { ...existing, ...updates });
    this.notify();
  }

  private clearConnectionTimeout(transferId: string): void {
    const t = this.connectionTimeouts.get(transferId);
    if (t) {
      clearTimeout(t);
      this.connectionTimeouts.delete(transferId);
    }
  }

  private async flushPendingCandidates(transferId: string, pc: RTCPeerConnection): Promise<void> {
    const buffered = this.pendingCandidates.get(transferId);
    if (buffered && buffered.length > 0) {
      for (const cand of buffered) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn('[WebRTC Flush Candidate Notice]', e);
        }
      }
      this.pendingCandidates.delete(transferId);
    }
  }

  /**
   * Initiate sending a file directly to peers via WebRTC DataChannel (enqueued)
   */
  public async sendFile(file: File, targetUserId?: string): Promise<string> {
    const transferId = 'p2p_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();

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
      senderName: 'You',
    };

    this.transfers.set(transferId, initialTransfer);
    this.notify();

    // Enqueue the transfer for sequential processing
    this.sendQueue.push({ transferId, file, targetUserId });
    this.processNextInSendQueue();

    return transferId;
  }

  /**
   * Initiate sending multiple files in batch (queued sequentially)
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
   * Processes the next item in the send queue sequentially
   */
  private async processNextInSendQueue(): Promise<void> {
    if (this.activeSenderTransferId) return; // A transfer is currently streaming
    if (this.sendQueue.length === 0) return;

    const nextItem = this.sendQueue.shift();
    if (!nextItem) return;

    const { transferId, file, targetUserId } = nextItem;
    if (this.abortedTransfers.has(transferId)) {
      this.processNextInSendQueue();
      return;
    }

    this.activeSenderTransferId = transferId;
    this.updateTransfer(transferId, { status: 'connecting' });

    if (typeof window === 'undefined' || !('RTCPeerConnection' in window)) {
      this.updateTransfer(transferId, {
        status: 'failed',
        error: 'WebRTC is not supported in this browser environment',
      });
      this.activeSenderTransferId = null;
      this.processNextInSendQueue();
      return;
    }

    try {
      await this.startSendingTransfer(transferId, file, targetUserId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transfer initialization failed';
      this.updateTransfer(transferId, { status: 'failed', error: msg });
      this.activeSenderTransferId = null;
      this.processNextInSendQueue();
    }
  }

  private async startSendingTransfer(transferId: string, file: File, targetUserId?: string): Promise<void> {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // Setup 15-second connection watchdog
    const timeout = setTimeout(() => {
      const current = this.transfers.get(transferId);
      if (current && (current.status === 'connecting' || current.status === 'queued')) {
        console.warn(`[WebRTC] Transfer ${transferId} connection timed out`);
        this.cancelTransfer(transferId, true);
        this.updateTransfer(transferId, {
          status: 'failed',
          error: 'Connection timed out. Check if peer is in room or firewall blocks P2P.',
        });
        this.activeSenderTransferId = null;
        this.processNextInSendQueue();
      }
    }, CONNECTION_TIMEOUT_MS);
    this.connectionTimeouts.set(transferId, timeout);

    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    this.activePeerConnections.set(transferId, pc);

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

    const dc = pc.createDataChannel(`transfer_${transferId}`, { ordered: true });
    dc.binaryType = 'arraybuffer';
    this.activeDataChannels.set(transferId, dc);

    dc.onopen = async () => {
      this.clearConnectionTimeout(transferId);
      this.updateTransfer(transferId, { status: 'transferring' });
      try {
        await this.streamFileOverChannel(transferId, file, dc, totalChunks);
      } catch (streamErr) {
        if (!this.abortedTransfers.has(transferId)) {
          const errStr = streamErr instanceof Error ? streamErr.message : 'Transfer failed';
          this.updateTransfer(transferId, { status: 'failed', error: errStr });
          this.activeSenderTransferId = null;
          this.processNextInSendQueue();
        }
      }
    };

    dc.onerror = (e) => {
      if (!this.abortedTransfers.has(transferId)) {
        console.error('[WebRTC DataChannel Error]', e);
        this.clearConnectionTimeout(transferId);
        this.updateTransfer(transferId, { status: 'failed', error: 'Data channel error' });
        this.activeSenderTransferId = null;
        this.processNextInSendQueue();
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
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          totalChunks,
        },
      });
    }
  }

  /**
   * Handle incoming WebRTC signaling message
   */
  public async handleSignal(signal: WebRTCSignalPayload): Promise<void> {
    if (signal.fromUserId === this.myUserId) return;
    if (signal.toUserId && signal.toUserId !== this.myUserId) return;

    const { type, transferId, sdp, candidate, fileMeta } = signal;

    if (type === 'cancel') {
      this.cancelTransfer(transferId, false);
      return;
    }

    if (type === 'offer' && sdp && fileMeta) {
      await this.handleIncomingOffer(signal);
      return;
    }

    if (type === 'answer' && sdp) {
      const pc = this.activePeerConnections.get(transferId);
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        // Flush any ICE candidates buffered before answer arrived
        await this.flushPendingCandidates(transferId, pc);
      }
      return;
    }

    if (type === 'candidate' && candidate) {
      const pc = this.activePeerConnections.get(transferId);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC Candidate Error]', e);
        }
      } else {
        // Buffer candidate until setRemoteDescription completes
        const list = this.pendingCandidates.get(transferId) || [];
        list.push(candidate);
        this.pendingCandidates.set(transferId, list);
      }
    }
  }

  private async handleIncomingOffer(signal: WebRTCSignalPayload): Promise<void> {
    const { transferId, sdp, fileMeta, fromUserId } = signal;
    if (!sdp || !fileMeta) return;

    const receivingTransfer: P2PTransfer = {
      id: transferId,
      fileName: fileMeta.name,
      fileSize: fileMeta.size,
      fileType: fileMeta.type,
      transferredBytes: 0,
      progress: 0,
      speed: 0,
      status: 'connecting',
      direction: 'receive',
      senderName: fromUserId.substring(0, 6),
    };

    this.transfers.set(transferId, receivingTransfer);
    this.receiveBuffers.set(transferId, { chunks: [], receivedBytes: 0, lastTime: Date.now() });
    this.notify();

    // Watchdog for incoming transfer handshake
    const timeout = setTimeout(() => {
      const current = this.transfers.get(transferId);
      if (current && current.status === 'connecting') {
        this.cancelTransfer(transferId, true);
        this.updateTransfer(transferId, {
          status: 'failed',
          error: 'Incoming transfer connection timed out',
        });
      }
    }, CONNECTION_TIMEOUT_MS);
    this.connectionTimeouts.set(transferId, timeout);

    try {
      const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
      this.activePeerConnections.set(transferId, pc);

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
        this.clearConnectionTimeout(transferId);
        const dc = event.channel;
        dc.binaryType = 'arraybuffer';
        this.activeDataChannels.set(transferId, dc);

        dc.onmessage = (msgEvent) => {
          this.handleIncomingDataChannelMessage(transferId, fileMeta, msgEvent.data);
        };

        dc.onerror = (err) => {
          if (!this.abortedTransfers.has(transferId)) {
            console.error('[WebRTC Receiver DC Error]', err);
            this.updateTransfer(transferId, { status: 'failed', error: 'Data channel error' });
          }
        };
      };

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush buffered candidates received before offer description was set
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
      this.clearConnectionTimeout(transferId);
      const msg = err instanceof Error ? err.message : 'Receiver initialization failed';
      this.updateTransfer(transferId, { status: 'failed', error: msg });
    }
  }

  private handleIncomingDataChannelMessage(
    transferId: string,
    fileMeta: { name: string; size: number; type: string; totalChunks: number },
    data: unknown
  ): void {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'complete') {
          this.finalizeReceivedFile(transferId, fileMeta);
        }
      } catch {
        // Ignored
      }
      return;
    }

    if (data instanceof ArrayBuffer) {
      const bufferState = this.receiveBuffers.get(transferId);
      if (!bufferState) return;

      bufferState.chunks.push(data);
      bufferState.receivedBytes += data.byteLength;

      const now = Date.now();
      const elapsed = (now - bufferState.lastTime) / 1000;
      let speed = 0;
      if (elapsed > 0.5) {
        speed = Math.round(data.byteLength / elapsed);
        bufferState.lastTime = now;
      }

      const progress = Math.min(100, Math.round((bufferState.receivedBytes / fileMeta.size) * 100));
      this.updateTransfer(transferId, {
        status: 'transferring',
        transferredBytes: bufferState.receivedBytes,
        progress,
        speed,
      });

      if (bufferState.receivedBytes >= fileMeta.size) {
        this.finalizeReceivedFile(transferId, fileMeta);
      }
    }
  }

  private finalizeReceivedFile(
    transferId: string,
    fileMeta: { name: string; size: number; type: string }
  ): void {
    const bufferState = this.receiveBuffers.get(transferId);
    if (!bufferState) return;

    this.clearConnectionTimeout(transferId);
    const blob = new Blob(bufferState.chunks, { type: fileMeta.type });
    const downloadUrl = URL.createObjectURL(blob);

    this.updateTransfer(transferId, {
      status: 'completed',
      transferredBytes: bufferState.receivedBytes,
      progress: 100,
      speed: 0,
      blob,
      downloadUrl,
    });

    this.receiveBuffers.delete(transferId);

    // Clean up peer connection after receiving complete file
    setTimeout(() => {
      const pc = this.activePeerConnections.get(transferId);
      if (pc) {
        try { pc.close(); } catch { /* ignore */ }
        this.activePeerConnections.delete(transferId);
      }
      const dc = this.activeDataChannels.get(transferId);
      if (dc) {
        try { dc.close(); } catch { /* ignore */ }
        this.activeDataChannels.delete(transferId);
      }
    }, 500);
  }

  private async streamFileOverChannel(
    transferId: string,
    file: File,
    dc: RTCDataChannel,
    totalChunks: number
  ): Promise<void> {
    let offset = 0;
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    while (offset < file.size) {
      if (this.abortedTransfers.has(transferId)) {
        return;
      }

      // Backpressure management: wait if data channel buffer is clogged
      if (dc.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE);
      const buffer = await slice.arrayBuffer();

      dc.send(buffer);

      offset += buffer.byteLength;
      bytesSinceLast += buffer.byteLength;

      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      let speed = 0;
      if (elapsed > 0.5) {
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

    // Send completion control message
    if (dc.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'complete', id: transferId, totalChunks }));
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

    // Clean up channel and connection after slight grace period
    setTimeout(() => {
      try { dc.close(); } catch { /* ignore */ }
      const pc = this.activePeerConnections.get(transferId);
      if (pc) {
        try { pc.close(); } catch { /* ignore */ }
      }
      this.activeDataChannels.delete(transferId);
      this.activePeerConnections.delete(transferId);
    }, 500);

    // Pick next queued file!
    this.activeSenderTransferId = null;
    setTimeout(() => this.processNextInSendQueue(), 80);
  }

  public cancelTransfer(transferId: string, notifyRemote = true): void {
    this.abortedTransfers.add(transferId);
    this.clearConnectionTimeout(transferId);

    // If it was in the send queue, remove it
    this.sendQueue = this.sendQueue.filter(item => item.transferId !== transferId);

    if (notifyRemote && this.signalSender) {
      this.signalSender({
        type: 'cancel',
        transferId,
        fromUserId: this.myUserId,
      });
    }

    const dc = this.activeDataChannels.get(transferId);
    if (dc) {
      try { dc.close(); } catch { /* ignore */ }
      this.activeDataChannels.delete(transferId);
    }

    const pc = this.activePeerConnections.get(transferId);
    if (pc) {
      try { pc.close(); } catch { /* ignore */ }
      this.activePeerConnections.delete(transferId);
    }

    const bufferState = this.receiveBuffers.get(transferId);
    if (bufferState) {
      this.receiveBuffers.delete(transferId);
    }

    this.pendingCandidates.delete(transferId);
    this.updateTransfer(transferId, { status: 'cancelled' });

    // If this was the active sender transfer, trigger next
    if (this.activeSenderTransferId === transferId) {
      this.activeSenderTransferId = null;
      setTimeout(() => this.processNextInSendQueue(), 50);
    }
  }

  public clearTransfer(transferId: string): void {
    this.clearConnectionTimeout(transferId);
    this.pendingCandidates.delete(transferId);
    this.sendQueue = this.sendQueue.filter(item => item.transferId !== transferId);

    const existing = this.transfers.get(transferId);
    if (existing?.downloadUrl) {
      try { URL.revokeObjectURL(existing.downloadUrl); } catch { /* ignore */ }
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

    this.activeDataChannels.forEach((dc) => {
      try { dc.close(); } catch { /* ignore */ }
    });
    this.activePeerConnections.forEach((pc) => {
      try { pc.close(); } catch { /* ignore */ }
    });
    this.transfers.forEach((t) => {
      if (t.downloadUrl) {
        try { URL.revokeObjectURL(t.downloadUrl); } catch { /* ignore */ }
      }
    });
    this.activeDataChannels.clear();
    this.activePeerConnections.clear();
    this.transfers.clear();
    this.receiveBuffers.clear();
    this.listeners.clear();
    this.abortedTransfers.clear();
    this.pendingCandidates.clear();
  }
}
