import { P2PTransfer, WebRTCSignalPayload, P2PTunnelState } from '../types';
import { createP2PStreamWriter, P2PStreamWriter, cleanupOPFSFile } from './opfsStorage';
import { playSuccessChime, triggerHapticSuccess, wakeLock } from './feedback';

// ── WebRTC & SCTP Constants (RFC 8831 / RFC 8832 Gold Standards) ─────────────
export const CHUNK_SIZE = 64 * 1024; // 64 KiB atomic SCTP chunk (Zero fragmentation)
const BUFFERED_LOW_THRESHOLD = 128 * 1024; // 128 KiB native threshold
const MAX_BUFFERED_AMOUNT = 384 * 1024; // 384 KiB high-water mark for kernel backpressure
const CONNECTION_TIMEOUT_MS = 15000; // 15 seconds watchdog
const PING_INTERVAL_MS = 4000; // 4 second latency heartbeat

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  iceCandidatePoolSize: 10,
};

interface QueuedSendItem {
  transferId: string;
  file: File;
  targetUserId?: string;
}

interface IncomingMeta {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  senderName?: string;
  timestamp?: number;
}

export class WebRTCTransferService {
  private myUserId: string;
  private senderName = 'You';
  private signalSender: ((signal: WebRTCSignalPayload) => void) | null = null;

  // Dedicated Dual-Channel Topology (Zero-latency persistent pipe)
  private persistentPC: RTCPeerConnection | null = null;
  private controlDC: RTCDataChannel | null = null; // Label: 'sp_ctrl' (JSON)
  private streamDC: RTCDataChannel | null = null; // Label: 'sp_data' (Raw Binary)

  // Tunnel state and observability
  private tunnelState: P2PTunnelState = {
    status: 'disconnected',
    latencyMs: null,
  };
  private tunnelListeners: Set<(state: P2PTunnelState) => void> = new Set();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Active transfers and OPFS streaming disk writer
  private transfers: Map<string, P2PTransfer> = new Map();
  private activeIncomingTransferId: string | null = null;
  private activeIncomingMeta: IncomingMeta | null = null;
  private activeIncomingWriter: P2PStreamWriter | null = null;
  private activeIncomingBytes = 0;
  private activeIncomingLastTime = 0;
  private activeIncomingBytesSinceLast = 0;

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

  // ── Tunnel State & Ping Heartbeat ──────────────────────────────────────────
  public getTunnelState(): P2PTunnelState {
    return { ...this.tunnelState };
  }

  public subscribeTunnel(listener: (state: P2PTunnelState) => void): () => void {
    this.tunnelListeners.add(listener);
    listener(this.getTunnelState());
    return () => {
      this.tunnelListeners.delete(listener);
    };
  }

  private updateTunnelState(updates: Partial<P2PTunnelState>): void {
    this.tunnelState = { ...this.tunnelState, ...updates };
    const state = this.getTunnelState();
    this.tunnelListeners.forEach((fn) => fn(state));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.controlDC && this.controlDC.readyState === 'open') {
        try {
          this.controlDC.send(JSON.stringify({ type: 'ping', t: Date.now() }));
        } catch {
          // Ignored
        }
      }
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Pre-Warming: Zero-Latency Connection Setup ─────────────────────────────
  /**
   * Pre-warms the WebRTC direct tunnel when peers enter a room.
   * Uses deterministic initiator resolution to avoid glare collisions.
   */
  public prewarm(targetUserId?: string): void {
    if (this.tunnelState.status === 'connected' || this.isConnectingPipe) return;
    if (this.persistentPC && this.persistentPC.connectionState === 'connected') return;

    // Deterministic Initiator Rule: alphabetically smaller userId initiates offer
    if (targetUserId && this.myUserId > targetUserId) {
      // Passive receiver: wait for peer's incoming offer
      return;
    }

    const dummyTransferId = 'prewarm_' + Date.now();
    this.isConnectingPipe = true;
    this.updateTunnelState({ status: 'connecting', remotePeerId: targetUserId });
    this.establishDualChannelPipe(dummyTransferId, targetUserId);
  }

  // ── Transfers Subscription ────────────────────────────────────────────────
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
    // Guard against completing transfers being overwritten by channel drops
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

  private closeActivePipe(): void {
    if (this.controlDC) {
      try {
        this.controlDC.close();
      } catch {
        // Ignored
      }
      this.controlDC = null;
    }
    if (this.streamDC) {
      try {
        this.streamDC.close();
      } catch {
        // Ignored
      }
      this.streamDC = null;
    }
    if (this.persistentPC) {
      try {
        this.persistentPC.close();
      } catch {
        // Ignored
      }
      this.persistentPC = null;
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

  // ── Sending Public API ────────────────────────────────────────────────────
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

    this.sendQueue.push({ transferId, file, targetUserId });
    this.processNextInSendQueue();

    return transferId;
  }

  public async sendFiles(files: File[] | FileList, targetUserId?: string): Promise<string[]> {
    const list = Array.from(files);
    const ids: string[] = [];
    for (const file of list) {
      const id = await this.sendFile(file, targetUserId);
      ids.push(id);
    }
    return ids;
  }

  private async processNextInSendQueue(): Promise<void> {
    if (this.activeSenderTransferId) return; // Currently streaming
    if (this.sendQueue.length === 0) return;

    const nextItem = this.sendQueue[0];
    if (!nextItem) return;

    if (this.abortedTransfers.has(nextItem.transferId)) {
      this.sendQueue.shift();
      this.processNextInSendQueue();
      return;
    }

    // If Dual-Channels are already open, stream INSTANTLY (0 ms delay)
    if (
      this.controlDC &&
      this.controlDC.readyState === 'open' &&
      this.streamDC &&
      this.streamDC.readyState === 'open'
    ) {
      this.sendQueue.shift();
      this.activeSenderTransferId = nextItem.transferId;
      this.updateTransfer(nextItem.transferId, { status: 'transferring' });
      await this.streamFileOverDualChannel(nextItem.transferId, nextItem.file);
      return;
    }

    // Otherwise establish dual-channel pipe if not connecting
    if (!this.isConnectingPipe) {
      this.isConnectingPipe = true;
      this.updateTransfer(nextItem.transferId, { status: 'connecting' });
      this.updateTunnelState({ status: 'connecting', remotePeerId: nextItem.targetUserId });
      await this.establishDualChannelPipe(nextItem.transferId, nextItem.targetUserId);
    }
  }

  // ── Dual-Channel Connection Establishment ─────────────────────────────────
  private async establishDualChannelPipe(transferId: string, targetUserId?: string): Promise<void> {
    if (typeof window === 'undefined' || !('RTCPeerConnection' in window)) {
      this.updateTransfer(transferId, {
        status: 'failed',
        error: 'WebRTC is not supported in this browser environment',
      });
      this.isConnectingPipe = false;
      this.updateTunnelState({ status: 'disconnected' });
      this.sendQueue.shift();
      this.processNextInSendQueue();
      return;
    }

    const timeout = setTimeout(() => {
      if (this.isConnectingPipe) {
        this.clearConnectionTimeout(transferId);
        this.isConnectingPipe = false;
        this.closeActivePipe();
        this.updateTunnelState({ status: 'disconnected' });

        if (!transferId.startsWith('prewarm_')) {
          console.warn('[WebRTC Tunnel] Peer connection handshake timed out');
          this.updateTransfer(transferId, {
            status: 'failed',
            error: 'Connection timed out. Ensure peer is online in the room.',
          });
          this.sendQueue.shift();
          this.processNextInSendQueue();
        }
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

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          this.updateTunnelState({ status: 'connected', remotePeerId: targetUserId });
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.updateTunnelState({ status: 'disconnected', latencyMs: null });
          this.stopHeartbeat();
        }
      };

      // 1. Channel A: Control & Metadata
      const ctrlDC = pc.createDataChannel('sp_ctrl', { ordered: true });
      this.controlDC = ctrlDC;
      this.wireControlChannel(ctrlDC, transferId);

      // 2. Channel B: Dedicated Raw Binary Stream
      const streamDC = pc.createDataChannel('sp_data', { ordered: true });
      streamDC.binaryType = 'arraybuffer';
      streamDC.bufferedAmountLowThreshold = BUFFERED_LOW_THRESHOLD;
      this.streamDC = streamDC;
      this.wireStreamChannel(streamDC, transferId);

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
      this.closeActivePipe();
      this.updateTunnelState({ status: 'disconnected' });
      if (!transferId.startsWith('prewarm_')) {
        const msg = err instanceof Error ? err.message : 'WebRTC initialization failed';
        this.updateTransfer(transferId, { status: 'failed', error: msg });
        this.sendQueue.shift();
        this.processNextInSendQueue();
      }
    }
  }

  // ── Channel Event Handlers ────────────────────────────────────────────────
  private wireControlChannel(dc: RTCDataChannel, transferId: string): void {
    dc.onopen = () => {
      this.clearConnectionTimeout(transferId);
      this.isConnectingPipe = false;
      this.updateTunnelState({ status: 'connected' });
      this.startHeartbeat();

      // If stream channel is also ready, start queued transfers
      if (this.streamDC && this.streamDC.readyState === 'open') {
        this.processNextInSendQueue();
      }
    };

    dc.onmessage = (event) => {
      if (typeof event.data === 'string') {
        this.handleIncomingControlMessage(event.data);
      }
    };

    dc.onclose = () => {
      if (this.controlDC === dc) {
        this.controlDC = null;
        this.updateTunnelState({ status: 'disconnected', latencyMs: null });
        this.stopHeartbeat();
      }
    };
  }

  private wireStreamChannel(dc: RTCDataChannel, transferId: string): void {
    dc.onopen = () => {
      this.clearConnectionTimeout(transferId);
      this.isConnectingPipe = false;

      if (this.controlDC && this.controlDC.readyState === 'open') {
        this.processNextInSendQueue();
      }
    };

    dc.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.handleIncomingBinaryChunk(event.data);
      }
    };

    dc.onclose = () => {
      if (this.streamDC === dc) {
        this.streamDC = null;
      }
    };
  }

  // ── Signaling Handler ─────────────────────────────────────────────────────
  public async handleSignal(signal: WebRTCSignalPayload): Promise<void> {
    if (signal.fromUserId === this.myUserId) return;
    if (signal.toUserId && signal.toUserId !== this.myUserId) return;

    const { type, transferId, sdp, candidate } = signal;

    if (type === 'peer-ready') {
      if (this.myUserId < signal.fromUserId && this.tunnelState.status !== 'connected' && !this.isConnectingPipe) {
        this.prewarm(signal.fromUserId);
      }
      return;
    }

    if (type === 'cancel' && transferId) {
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
        if (transferId) await this.flushPendingCandidates(transferId, pc);
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
      } else if (transferId) {
        const list = this.pendingCandidates.get(transferId) || [];
        list.push(candidate);
        this.pendingCandidates.set(transferId, list);
      }
    }
  }

  private async handleIncomingOffer(signal: WebRTCSignalPayload): Promise<void> {
    const transferId = signal.transferId || 'conn_' + Date.now();
    const { sdp, fromUserId } = signal;
    if (!sdp) return;

    this.closeActivePipe();

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

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          this.updateTunnelState({ status: 'connected', remotePeerId: fromUserId });
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.updateTunnelState({ status: 'disconnected', latencyMs: null });
          this.stopHeartbeat();
        }
      };

      pc.ondatachannel = (event) => {
        const channel = event.channel;
        if (channel.label === 'sp_ctrl') {
          this.controlDC = channel;
          this.wireControlChannel(channel, transferId);
        } else if (channel.label === 'sp_data') {
          channel.binaryType = 'arraybuffer';
          channel.bufferedAmountLowThreshold = BUFFERED_LOW_THRESHOLD;
          this.streamDC = channel;
          this.wireStreamChannel(channel, transferId);
        }
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

  // ── Inbound Message Handlers (Control & Binary) ───────────────────────────
  private async handleIncomingControlMessage(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw);

      // Latency Measurement
      if (msg.type === 'ping') {
        if (this.controlDC && this.controlDC.readyState === 'open') {
          this.controlDC.send(JSON.stringify({ type: 'pong', t: msg.t }));
        }
        return;
      }

      if (msg.type === 'pong') {
        const latency = Math.max(1, Math.round(Date.now() - msg.t));
        this.updateTunnelState({ latencyMs: latency });
        return;
      }

      // File Header: Start OPFS Disk Stream
      if (msg.type === 'file-header') {
        const { id, name, size, mimeType, senderName, timestamp } = msg;
        this.activeIncomingTransferId = id;
        this.activeIncomingMeta = { id, name, size, mimeType, senderName, timestamp };
        this.activeIncomingBytes = 0;
        this.activeIncomingLastTime = Date.now();
        this.activeIncomingBytesSinceLast = 0;

        // Acquire mobile screen wake lock
        wakeLock.retain();

        // Create zero-RAM OPFS disk stream writer
        this.activeIncomingWriter = await createP2PStreamWriter(id, name, mimeType || 'application/octet-stream');

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

      // File Complete: Finalize disk file & notify
      if (msg.type === 'file-complete') {
        await this.finalizeIncomingTransfer();
        return;
      }

      // Remote Cancel
      if (msg.type === 'cancel') {
        this.cancelTransfer(msg.id, false);
        return;
      }
    } catch (e) {
      console.warn('[WebRTC Control Frame Error]', e);
    }
  }

  private async handleIncomingBinaryChunk(chunk: ArrayBuffer): Promise<void> {
    if (!this.activeIncomingWriter || !this.activeIncomingMeta) return;

    await this.activeIncomingWriter.write(chunk);

    this.activeIncomingBytes += chunk.byteLength;
    this.activeIncomingBytesSinceLast += chunk.byteLength;

    const now = Date.now();
    const elapsed = (now - this.activeIncomingLastTime) / 1000;
    let speed = 0;
    if (elapsed > 0.25) {
      speed = Math.round(this.activeIncomingBytesSinceLast / elapsed);
      this.activeIncomingLastTime = now;
      this.activeIncomingBytesSinceLast = 0;
    }

    const { id, size } = this.activeIncomingMeta;
    const progress = Math.min(100, Math.round((this.activeIncomingBytes / size) * 100));
    const etaSeconds = speed > 0 ? Math.ceil((size - this.activeIncomingBytes) / speed) : undefined;

    this.updateTransfer(id, {
      transferredBytes: this.activeIncomingBytes,
      progress,
      speed,
      etaSeconds,
    });
  }

  private async finalizeIncomingTransfer(): Promise<void> {
    if (!this.activeIncomingWriter || !this.activeIncomingMeta) return;

    const { id, size, mimeType, senderName, timestamp } = this.activeIncomingMeta;

    try {
      const file = await this.activeIncomingWriter.finish();
      const downloadUrl = URL.createObjectURL(file);

      this.updateTransfer(id, {
        status: 'completed',
        transferredBytes: size,
        fileType: mimeType || 'application/octet-stream',
        progress: 100,
        speed: 0,
        etaSeconds: 0,
        blob: file,
        downloadUrl,
        timestamp: timestamp || Date.now(),
        senderName: senderName || 'Peer',
      });

      // Feedback: synthesized audio chime & mobile haptic pulse
      playSuccessChime();
      triggerHapticSuccess();
    } catch (err) {
      console.error('[WebRTC Disk Finalization Error]', err);
      this.updateTransfer(id, { status: 'failed', error: 'Failed to write file to local disk' });
    } finally {
      wakeLock.release();
      this.activeIncomingWriter = null;
      this.activeIncomingMeta = null;
      this.activeIncomingTransferId = null;
    }
  }

  // ── High-Speed Dual-Channel Streaming Loop ────────────────────────────────
  private async streamFileOverDualChannel(transferId: string, file: File): Promise<void> {
    const ctrl = this.controlDC;
    const stream = this.streamDC;

    if (!ctrl || ctrl.readyState !== 'open' || !stream || stream.readyState !== 'open') {
      this.updateTransfer(transferId, { status: 'failed', error: 'DataChannel stream not ready' });
      this.activeSenderTransferId = null;
      this.processNextInSendQueue();
      return;
    }

    wakeLock.retain();

    // 1. Send Header Frame over Control Channel
    try {
      ctrl.send(
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
      wakeLock.release();
      this.updateTransfer(transferId, { status: 'failed', error: 'Failed to dispatch file header' });
      this.activeSenderTransferId = null;
      this.processNextInSendQueue();
      return;
    }

    let offset = 0;
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    // 2. Stream binary data in 64 KiB chunks with native kernel backpressure
    while (offset < file.size) {
      if (this.abortedTransfers.has(transferId)) {
        wakeLock.release();
        return;
      }

      // Check native socket buffer: wait for kernel to drain
      if (stream.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await new Promise<void>((resolve) => {
          stream.onbufferedamountlow = () => {
            stream.onbufferedamountlow = null;
            resolve();
          };
        });
      }

      const chunkEnd = Math.min(offset + CHUNK_SIZE, file.size);
      const chunkSlice = file.slice(offset, chunkEnd);
      const chunkBuffer = await chunkSlice.arrayBuffer();

      stream.send(chunkBuffer);

      offset += chunkBuffer.byteLength;
      bytesSinceLast += chunkBuffer.byteLength;

      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      let speed = 0;
      if (elapsed > 0.25) {
        speed = Math.round(bytesSinceLast / elapsed);
        lastTime = now;
        bytesSinceLast = 0;
      }

      const progress = Math.min(100, Math.round((offset / file.size) * 100));
      const etaSeconds = speed > 0 ? Math.ceil((file.size - offset) / speed) : undefined;

      this.updateTransfer(transferId, {
        transferredBytes: offset,
        progress,
        speed,
        etaSeconds,
      });
    }

    // 3. Send Complete Control Frame
    if (ctrl.readyState === 'open') {
      try {
        ctrl.send(JSON.stringify({ type: 'file-complete', id: transferId }));
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
      etaSeconds: 0,
      blob: file,
      downloadUrl: senderBlobUrl,
    });

    playSuccessChime();
    triggerHapticSuccess();
    wakeLock.release();

    // Advance queue immediately over the persistent channel
    this.activeSenderTransferId = null;
    setTimeout(() => this.processNextInSendQueue(), 15);
  }

  // ── Cancel & Cleanup ──────────────────────────────────────────────────────
  public cancelTransfer(transferId: string, notifyRemote = true): void {
    this.abortedTransfers.add(transferId);
    this.clearConnectionTimeout(transferId);

    this.sendQueue = this.sendQueue.filter((item) => item.transferId !== transferId);

    if (notifyRemote && this.controlDC && this.controlDC.readyState === 'open') {
      try {
        this.controlDC.send(JSON.stringify({ type: 'cancel', id: transferId }));
      } catch {
        // Ignored
      }
    }

    if (this.activeIncomingTransferId === transferId) {
      if (this.activeIncomingWriter) {
        this.activeIncomingWriter.abort().catch(() => {});
        this.activeIncomingWriter = null;
      }
      this.activeIncomingMeta = null;
      this.activeIncomingTransferId = null;
      cleanupOPFSFile(transferId).catch(() => {});
      wakeLock.release();
    }

    this.updateTransfer(transferId, { status: 'cancelled' });

    if (this.activeSenderTransferId === transferId) {
      this.activeSenderTransferId = null;
      wakeLock.release();
      setTimeout(() => this.processNextInSendQueue(), 15);
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

    cleanupOPFSFile(transferId).catch(() => {});
    this.transfers.delete(transferId);
    this.notify();
  }

  public clearAllCompletedTransfers(): void {
    const toClear: string[] = [];
    this.transfers.forEach((t, id) => {
      if (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled') {
        toClear.push(id);
      }
    });
    toClear.forEach((id) => this.clearTransfer(id));
  }

  public cleanup(): void {
    this.stopHeartbeat();
    this.connectionTimeouts.forEach((t) => clearTimeout(t));
    this.connectionTimeouts.clear();
    this.sendQueue = [];
    this.activeSenderTransferId = null;
    this.isConnectingPipe = false;
    this.closeActivePipe();

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
    this.tunnelListeners.clear();
    this.listeners.clear();
  }
}
