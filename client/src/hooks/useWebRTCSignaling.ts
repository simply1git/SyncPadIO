import { useEffect, useCallback, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'initiator-request';
  from: string;
  to?: string;
  data: any;
  timestamp: number;
}

export const useWebRTCSignaling = (
  channel: RealtimeChannel | null,
  userId: string,
  _peerId: string | null,
  onOffer?: (offer: RTCSessionDescriptionInit, from: string) => void,
  onAnswer?: (answer: RTCSessionDescriptionInit, from: string) => void,
  onIceCandidate?: (candidate: RTCIceCandidate, from: string) => void,
  onInitiatorRequest?: (from: string) => void,
) => {
  const sentOffersRef = useRef<Set<string>>(new Set());

  // Listen for signaling messages
  useEffect(() => {
    if (!channel) return;

    const handlePayload = (payload: any) => {
      const message: SignalingMessage = payload.new || payload;

      // Only process messages relevant to us
      if (message.to && message.to !== userId && message.from !== userId) {
        return;
      }

      if (message.from === userId) {
        return; // Ignore own messages
      }

      const from = message.from;

      switch (message.type) {
        case 'offer':
          onOffer?.(message.data, from);
          break;
        case 'answer':
          onAnswer?.(message.data, from);
          break;
        case 'ice-candidate':
          try {
            const candidate = new RTCIceCandidate(message.data);
            onIceCandidate?.(candidate, from);
          } catch (error) {
            console.error('Invalid ICE candidate:', error);
          }
          break;
        case 'initiator-request':
          onInitiatorRequest?.(from);
          break;
      }
    };

    channel.on('broadcast', { event: 'webrtc-signal' }, handlePayload);

    return () => {
      channel.unsubscribe();
    };
  }, [channel, userId, onOffer, onAnswer, onIceCandidate, onInitiatorRequest]);

  // Send signaling message
  const sendSignalingMessage = useCallback(
    async (type: SignalingMessage['type'], data: any, to?: string) => {
      if (!channel) return;

      const message: SignalingMessage = {
        type,
        from: userId,
        to,
        data,
        timestamp: Date.now(),
      };

      try {
        // Send via Supabase broadcast - use the event type as the channel message type
        await (channel as any).send({
          type: 'broadcast',
          event: 'webrtc-signal',
          payload: message,
        });
      } catch (error) {
        console.error('Error sending signaling message:', error);
      }
    },
    [channel, userId]
  );

  // Request initiator to start file transfer
  const requestInitiator = useCallback(async (targetPeerId: string) => {
    if (sentOffersRef.current.has(targetPeerId)) {
      return; // Already requested
    }
    sentOffersRef.current.add(targetPeerId);
    await sendSignalingMessage('initiator-request', {}, targetPeerId);
  }, [sendSignalingMessage]);

  // Send offer
  const sendOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, targetPeerId: string) => {
      const offerData = {
        type: offer.type,
        sdp: offer.sdp,
      };
      await sendSignalingMessage('offer', offerData, targetPeerId);
    },
    [sendSignalingMessage]
  );

  // Send answer
  const sendAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit, targetPeerId: string) => {
      const answerData = {
        type: answer.type,
        sdp: answer.sdp,
      };
      await sendSignalingMessage('answer', answerData, targetPeerId);
    },
    [sendSignalingMessage]
  );

  // Send ICE candidate
  const sendIceCandidate = useCallback(
    async (candidate: RTCIceCandidate, targetPeerId: string) => {
      if (candidate.candidate) {
        const candidateData = {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex,
          sdpMid: candidate.sdpMid,
        };
        await sendSignalingMessage('ice-candidate', candidateData, targetPeerId);
      }
    },
    [sendSignalingMessage]
  );

  return {
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    requestInitiator,
  };
};
