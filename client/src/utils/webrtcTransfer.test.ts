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

  it('delegates multiple files in batch via sendFiles', async () => {
    const mockFile1 = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const mockFile2 = new File(['world'], 'world.txt', { type: 'text/plain' });

    const sendSpy = vi.spyOn(service, 'sendFile').mockImplementation(async (f) => `id_${f.name}`);
    const results = await service.sendFiles([mockFile1, mockFile2]);

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(results).toEqual(['id_hello.txt', 'id_world.txt']);
  });

  it('clears completed, failed, and cancelled transfers with clearAllCompletedTransfers', () => {
    // Manually populate internal transfers map for testing
    // @ts-expect-error accessing private property for isolated unit test
    service.transfers.set('t1', { id: 't1', fileName: 'f1.txt', fileSize: 100, status: 'completed', direction: 'send', transferredBytes: 100, progress: 100, speed: 0 });
    // @ts-expect-error accessing private property for isolated unit test
    service.transfers.set('t2', { id: 't2', fileName: 'f2.txt', fileSize: 200, status: 'failed', direction: 'receive', transferredBytes: 50, progress: 25, speed: 0, error: 'fail' });
    // @ts-expect-error accessing private property for isolated unit test
    service.transfers.set('t3', { id: 't3', fileName: 'f3.txt', fileSize: 300, status: 'transferring', direction: 'send', transferredBytes: 150, progress: 50, speed: 1024 });

    expect(service.getAllTransfers().length).toBe(3);

    service.clearAllCompletedTransfers();

    const remaining = service.getAllTransfers();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('t3');
    expect(remaining[0].status).toBe('transferring');
  });

  it('buffers incoming ICE candidates if remote description is not yet ready', async () => {
    const candidateSignal: WebRTCSignalPayload = {
      type: 'candidate',
      transferId: 'buffered_x9',
      fromUserId: 'remote_peer_123',
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    };

    // Candidate arrives before offer/description is set
    await service.handleSignal(candidateSignal);

    // Verify candidate was buffered rather than dropped
    // @ts-expect-error accessing private property for isolated unit test
    const buffered = service.pendingCandidates.get('buffered_x9');
    expect(buffered).toBeDefined();
    expect(buffered?.length).toBe(1);
  });

  it('initializes tunnel state as disconnected and notifies tunnel subscribers', () => {
    const tunnelListener = vi.fn();
    const unsub = service.subscribeTunnel(tunnelListener);

    expect(tunnelListener).toHaveBeenCalledTimes(1);
    expect(tunnelListener).toHaveBeenCalledWith({
      status: 'disconnected',
      latencyMs: null,
    });

    unsub();
  });

  it('prewarms connection only when myUserId is lexicographically lower than targetUserId', () => {
    const higherPeer = 'user_zzz999';
    const lowerPeer = 'user_aaa000';

    // Mock establishing pipe
    // @ts-expect-error accessing private method for test spy
    const establishSpy = vi.spyOn(service, 'establishDualChannelPipe').mockImplementation(async () => {});

    // Case 1: myUserId (user_abc123) is higher than lowerPeer -> Should wait (no initiate)
    service.prewarm(lowerPeer);
    expect(establishSpy).not.toHaveBeenCalled();

    // Case 2: myUserId (user_abc123) is lower than higherPeer -> Should initiate prewarm
    service.prewarm(higherPeer);
    expect(establishSpy).toHaveBeenCalledTimes(1);
  });
});

