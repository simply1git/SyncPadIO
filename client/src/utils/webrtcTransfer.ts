import { P2PTransfer, WebRTCSignalPayload } from '../types';

export const CHUNK_SIZE = 64 * 1024; // 64 KiB
const MAX_BUFFERED_AMOUNT = 256 * 1024; // 256 KiB backpressure threshold

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class WebRTCTransferService {
  private myUserId: string;
  private signalSender: ((signal: WebRTCSignalPayload) => void) | null = null;
  private activePeerConnections: Map<string, RTCPeerConnection> = new Map();
  private activeDataChannels: Map<string, RTCDataChannel> = new Map();
  private transfers: Map<string, P2PTransfer> = new Map();
  private receiveBuffers: Map<string, { chunks: ArrayBuffer[]; receivedBytes: number; lastTime: number }> = new Map();
  private listeners: Set<(transfers: P2PTransfer[]) => void> = new Set();
  private abortedTransfers: Set<string> = new Set();

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

  /**
   * Initiate sending a file directly to peers via WebRTC DataChannel
   */
  public async sendFile(file: File, targetUserId?: string): Promise<string> {
    const transferId = 'p2p_' + Math.random().toString(36).substring(2, 10);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    const initialTransfer: P2PTransfer = {
      id: transferId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'application/octet-stream',
      transferredBytes: 0,
      progress: 0,
      speed: 0,
      status: 'connecting',
      direction: 'send',
    };

    this.transfers.set(transferId, initialTransfer);
    this.notify();

    if (typeof window === 'undefined' || !('RTCPeerConnection' in window)) {
      this.updateTransfer(transferId, {
        status: 'failed',
        error: 'WebRTC is not supported in this browser environment',
      });
      return transferId;
    }

    try {
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
        this.updateTransfer(transferId, { status: 'transferring' });
        try {
          await this.streamFileOverChannel(transferId, file, dc, totalChunks);
        } catch (streamErr) {
          if (!this.abortedTransfers.has(transferId)) {
            const errStr = streamErr instanceof Error ? streamErr.message : 'Transfer failed';
            this.updateTransfer(transferId, { status: 'failed', error: errStr });
          }
        }
      };

      dc.onerror = (e) => {
        if (!this.abortedTransfers.has(transferId)) {
          console.error('[WebRTC DataChannel Error]', e);
          this.updateTransfer(transferId, { status: 'failed', error: 'Data channel error' });
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

      return transferId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize WebRTC';
      this.updateTransfer(transferId, { status: 'failed', error: msg });
      return transferId;
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
      let currentSpeed = 0;
      if (elapsed > 0.5) {
        currentSpeed = Math.round(data.byteLength / elapsed);
        bufferState.lastTime = now;
      }

      const progress = fileMeta.size > 0
        ? Math.min(100, Math.round((bufferState.receivedBytes / fileMeta.size) * 100))
        : 100;

      this.updateTransfer(transferId, {
        status: 'transferring',
        transferredBytes: bufferState.receivedBytes,
        progress,
        speed: currentSpeed,
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

    const blob = new Blob(bufferState.chunks, { type: fileMeta.type });
    const downloadUrl = URL.createObjectURL(blob);

    this.updateTransfer(transferId, {
      status: 'completed',
      transferredBytes: bufferState.receivedBytes,
      progress: 100,
      blob,
      downloadUrl,
    });

    this.receiveBuffers.delete(transferId);
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

    this.updateTransfer(transferId, {
      status: 'completed',
      transferredBytes: file.size,
      progress: 100,
    });
  }

  public cancelTransfer(transferId: string, notifyRemote = true): void {
    this.abortedTransfers.add(transferId);

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

    this.updateTransfer(transferId, { status: 'cancelled' });
  }

  public clearTransfer(transferId: string): void {
    const existing = this.transfers.get(transferId);
    if (existing?.downloadUrl) {
      try { URL.revokeObjectURL(existing.downloadUrl); } catch { /* ignore */ }
    }
    this.transfers.delete(transferId);
    this.notify();
  }

  public cleanup(): void {
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
  }
}
