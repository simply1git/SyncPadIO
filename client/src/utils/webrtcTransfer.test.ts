import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebRTCTransferService, CHUNK_SIZE, DEFAULT_RTC_CONFIG } from './webrtcTransfer';
import { WebRTCSignalPayload } from '../types';

describe('WebRTC P2P Direct Transfer Service', () => {
  let service: WebRTCTransferService;
  const mockUserId = 'user_abc123';

  beforeEach(() => {
    service = new WebRTCTransferService(mockUserId);
  });

  it('exports correct constants and STUN configurations', () => {
    expect(CHUNK_SIZE).toBe(64 * 1024);
    expect(DEFAULT_RTC_CONFIG.iceServers).toBeDefined();
    expect(DEFAULT_RTC_CONFIG.iceServers?.length).toBeGreaterThan(0);
  });

  it('subscribes and notifies listeners with active transfers', () => {
    const mockListener = vi.fn();
    const unsubscribe = service.subscribe(mockListener);

    expect(mockListener).toHaveBeenCalledTimes(1);
    expect(mockListener).toHaveBeenCalledWith([]);

    unsubscribe();
  });

  it('handles cancel signal from remote peer gracefully', async () => {
    const mockListener = vi.fn();
    service.subscribe(mockListener);

    const cancelSignal: WebRTCSignalPayload = {
      type: 'cancel',
      transferId: 'test_x1',
      fromUserId: 'remote_peer_999',
    };

    await service.handleSignal(cancelSignal);
    expect(service.getAllTransfers().length).toBe(0);
  });

  it('ignores self-originated signals', async () => {
    const mockListener = vi.fn();
    service.subscribe(mockListener);

    const selfSignal: WebRTCSignalPayload = {
      type: 'offer',
      transferId: 'test_x2',
      fromUserId: mockUserId, // same user
    };

    await service.handleSignal(selfSignal);
    expect(mockListener).toHaveBeenCalledTimes(1); // initial only
  });

  it('ignores signals intended for a different user', async () => {
    const mockListener = vi.fn();
    service.subscribe(mockListener);

    const wrongUserSignal: WebRTCSignalPayload = {
      type: 'offer',
      transferId: 'test_x3',
      fromUserId: 'someone_else',
      toUserId: 'different_user_456', // not mockUserId
    };

    await service.handleSignal(wrongUserSignal);
    expect(mockListener).toHaveBeenCalledTimes(1); // initial only
  });

  it('cleans up all active connections and URLs on service cleanup', () => {
    service.cleanup();
    expect(service.getAllTransfers()).toEqual([]);
  });
});

