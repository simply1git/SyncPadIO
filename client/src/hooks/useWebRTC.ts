import { useState, useCallback, useRef } from 'react';

export interface RTCFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  chunks: number;
  receivedChunks: Set<number>;
  blob?: Blob;
}

export interface TransferState {
  status: 'idle' | 'connecting' | 'connected' | 'transferring' | 'completed' | 'error';
  progress: number; // 0-100
  speed: number; // bytes/sec
  eta: number; // seconds
  error?: string;
}

const CHUNK_SIZE = 256 * 1024; // 256KB chunks
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export const useWebRTC = (_roomId: string, _userId: string) => {
  const [peerConnections, setPeerConnections] = useState<Map<string, RTCPeerConnection>>(new Map());
  const [dataChannels, setDataChannels] = useState<Map<string, RTCDataChannel>>(new Map());
  const [transferState, setTransferState] = useState<TransferState>({ status: 'idle', progress: 0, speed: 0, eta: 0 });
  const [files, setFiles] = useState<Map<string, RTCFile>>(new Map());
  
  const fileBufferRef = useRef<Map<string, Uint8Array>>(new Map());
  const startTimeRef = useRef<number>(0);
  const transferredRef = useRef<number>(0);
  const callbacksRef = useRef<{
    onProgress?: (progress: number, speed: number, eta: number) => void;
    onComplete?: (file: RTCFile) => void;
    onError?: (error: string) => void;
  }>({});

  // Initialize WebRTC connection with a peer
  const initiatePeerConnection = useCallback(async (peerId: string): Promise<RTCPeerConnection> => {
    const existing = peerConnections.get(peerId);
    if (existing && existing.connectionState === 'connected') {
      return existing;
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-compat',
    });

    // Create data channel for file transfer
    const dc = pc.createDataChannel('file-transfer', {
      ordered: true,
      maxPacketLifeTime: 5000,
    });
    setupDataChannel(dc, peerId);

    pc.addEventListener('datachannel', (event) => {
      setupDataChannel(event.channel, peerId);
    });

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        // Send ICE candidate via signaling (handled by parent)
        window.dispatchEvent(new CustomEvent('ice-candidate', {
          detail: { peerId, candidate: event.candidate }
        }));
      }
    });

    setPeerConnections(prev => new Map(prev).set(peerId, pc));
    return pc;
  }, [peerConnections]);

  // Setup data channel with file transfer handlers
  const setupDataChannel = useCallback((dc: RTCDataChannel, peerId: string) => {
    dc.binaryType = 'arraybuffer';
    dc.bufferedAmountLowThreshold = 1024 * 1024; // 1MB

    dc.addEventListener('open', () => {
      setTransferState(prev => ({ ...prev, status: 'connected' }));
    });

    dc.addEventListener('close', () => {
      setTransferState(prev => ({ ...prev, status: 'idle' }));
    });

    dc.addEventListener('message', (event) => {
      handleIncomingChunk(event.data, peerId);
    });

    dc.addEventListener('error', (_event) => {
      const error = 'Data channel error';
      setTransferState(prev => ({ ...prev, status: 'error', error }));
      callbacksRef.current.onError?.(error);
    });

    setDataChannels(prev => new Map(prev).set(peerId, dc));
  }, []);

  // Send file to peer in chunks
  const sendFile = useCallback(async (file: File, targetPeerId: string) => {
    const dc = dataChannels.get(targetPeerId);
    if (!dc || dc.readyState !== 'open') {
      const error = 'Data channel not ready';
      setTransferState(prev => ({ ...prev, status: 'error', error }));
      callbacksRef.current.onError?.(error);
      return;
    }

    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    setTransferState({ status: 'transferring', progress: 0, speed: 0, eta: 0 });
    transferredRef.current = 0;
    startTimeRef.current = Date.now();

    // Send file metadata
    const metadata = {
      type: 'file-start',
      id: Math.random().toString(36).substring(2, 10),
      name: file.name,
      size: file.size,
      mimeType: file.type,
      chunks,
    };
    dc.send(JSON.stringify(metadata));

    // Send chunks
    for (let i = 0; i < chunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = await file.slice(start, end).arrayBuffer();

      // Wait if buffer is full
      while (dc.bufferedAmount > 10 * 1024 * 1024) { // 10MB buffer limit
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Send chunk with metadata
      const chunkData = {
        type: 'chunk',
        index: i,
        data: new Uint8Array(chunk),
      };
      dc.send(JSON.stringify(chunkData));

      // Update progress
      transferredRef.current += end - start;
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const speed = elapsed > 0 ? transferredRef.current / elapsed : 0;
      const remaining = file.size - transferredRef.current;
      const eta = speed > 0 ? remaining / speed : 0;
      const progress = Math.round((transferredRef.current / file.size) * 100);

      setTransferState({
        status: 'transferring',
        progress,
        speed: Math.round(speed),
        eta: Math.round(eta),
      });
      callbacksRef.current.onProgress?.(progress, speed, eta);
    }

    // Send completion signal
    dc.send(JSON.stringify({ type: 'file-complete', id: metadata.id }));
    setTransferState({ status: 'completed', progress: 100, speed: 0, eta: 0 });
    callbacksRef.current.onComplete?.(metadata as any);
  }, [dataChannels]);

  // Handle incoming chunk
  const handleIncomingChunk = useCallback((data: ArrayBuffer, _peerId: string) => {
    try {
      // Try to decode as text first (JSON messages)
      try {
        const decoder = new TextDecoder();
        const text = decoder.decode(new Uint8Array(data));
        const message = JSON.parse(text);

        if (message.type === 'file-start') {
          const fileId = message.id;
          const newFile: RTCFile = {
            id: fileId,
            name: message.name,
            size: message.size,
            mimeType: message.mimeType,
            chunks: message.chunks,
            receivedChunks: new Set(),
          };
          setFiles(prev => new Map(prev).set(fileId, newFile));
          fileBufferRef.current.set(fileId, new Uint8Array(message.size as number));
          setTransferState({ status: 'transferring', progress: 0, speed: 0, eta: 0 });
        } else if (message.type === 'chunk') {
          const fileId = message.fileId || Array.from(files.keys())[0];
          const file = files.get(fileId);
          if (file) {
            const chunkData = new Uint8Array(message.data);
            const buffer = fileBufferRef.current.get(fileId);
            if (buffer) {
              const start = message.index * CHUNK_SIZE;
              buffer.set(chunkData, start);
              file.receivedChunks.add(message.index);

              const progress = Math.round((file.receivedChunks.size / file.chunks) * 100);
              const elapsed = (Date.now() - startTimeRef.current) / 1000;
              const speed = elapsed > 0 ? (buffer.byteLength / elapsed) : 0;
              const remaining = file.size - buffer.byteLength;
              const eta = speed > 0 ? remaining / speed : 0;

              setTransferState({
                status: 'transferring',
                progress,
                speed: Math.round(speed),
                eta: Math.round(eta),
              });
              callbacksRef.current.onProgress?.(progress, speed, eta);
            }
          }
        } else if (message.type === 'file-complete') {
          const fileId = message.id;
          const file = files.get(fileId);
          if (file) {
            const buffer = fileBufferRef.current.get(fileId);
            if (buffer) {
              file.blob = new Blob([buffer as BlobPart], { type: file.mimeType });
              setTransferState({ status: 'completed', progress: 100, speed: 0, eta: 0 });
              callbacksRef.current.onComplete?.(file);
            }
          }
        }
      } catch (parseError) {
        // Not JSON, treat as binary chunk
        console.debug('Binary chunk received, not JSON');
      }
    } catch (error) {
      console.error('Error handling chunk:', error);
    }
  }, [files]);

  // Create offer for initiator
  const createOffer = useCallback(async (peerId: string) => {
    const pc = await initiatePeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, [initiatePeerConnection]);

  // Create answer for responder
  const createAnswer = useCallback(async (peerId: string, offer: RTCSessionDescriptionInit) => {
    const pc = await initiatePeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }, [initiatePeerConnection]);

  // Add ICE candidate
  const addIceCandidate = useCallback((peerId: string, candidate: RTCIceCandidate) => {
    const pc = peerConnections.get(peerId);
    if (pc) {
      pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    }
  }, [peerConnections]);

  // Handle remote answer
  const handleAnswer = useCallback((peerId: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnections.get(peerId);
    if (pc) {
      pc.setRemoteDescription(new RTCSessionDescription(answer)).catch(console.error);
    }
  }, [peerConnections]);

  // Set up callbacks
  const setCallbacks = useCallback((callbacks: typeof callbacksRef.current) => {
    callbacksRef.current = callbacks;
  }, []);

  // Clean up
  const cleanup = useCallback(() => {
    peerConnections.forEach(pc => pc.close());
    dataChannels.forEach(dc => dc.close());
    setPeerConnections(new Map());
    setDataChannels(new Map());
    setTransferState({ status: 'idle', progress: 0, speed: 0, eta: 0 });
  }, [peerConnections, dataChannels]);

  return {
    // State
    transferState,
    files,
    
    // Methods
    sendFile,
    createOffer,
    createAnswer,
    addIceCandidate,
    handleAnswer,
    setCallbacks,
    cleanup,
    
    // Peer management
    peerConnections,
    dataChannels,
  };
};
