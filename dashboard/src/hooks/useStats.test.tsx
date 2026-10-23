import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useStats } from './useStats';

// Minimal fake WS that lets the test drive onopen/onmessage/onclose.
class FakeWebSocket {
    static instances: FakeWebSocket[] = [];

    url: string;
    readyState = 0;
    bufferedAmount = 0;
    onopen: (() => void) | null = null;
    onmessage: ((evt: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
        // Fire open on the next microtask so the hook's onopen handler
        // is attached before we call it.
        queueMicrotask(() => { this.readyState = 1; this.onopen?.(); });
    }

    send() { /* not used by the hook */ }
    close() { this.readyState = 3; this.onclose?.(); }
}

beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('useStats', () => {
    it('starts in connecting state and transitions to open', async () => {
        const { result } = renderHook(() => useStats());
        await waitFor(() => expect(result.current.connection).toBe('open'));
    });

    it('parses a snapshot message and exposes latest + points', async () => {
        const { result } = renderHook(() => useStats());
        await waitFor(() => expect(result.current.connection).toBe('open'));

        const ws = FakeWebSocket.instances[0]!;
        const snap = {
            total_packets: 10, total_bytes: 1000,
            tcp_packets: 5, udp_packets: 3, icmp_packets: 1, other_packets: 1,
            ipv4_packets: 9, non_ipv4_packets: 1,
            pps: 20, bps: 2000, t: 1000,
        };

        act(() => { ws.onmessage?.({ data: JSON.stringify({ type: 'snapshot', data: snap }) }); });

        expect(result.current.latest).toEqual(snap);
        expect(result.current.points).toHaveLength(1);
        expect(result.current.points[0]).toEqual(snap);
    });

    it('ignores non-JSON messages and wrong-type messages', async () => {
        const { result } = renderHook(() => useStats());
        await waitFor(() => expect(result.current.connection).toBe('open'));

        const ws = FakeWebSocket.instances[0]!;
        act(() => {
            ws.onmessage?.({ data: 'not json' });
            ws.onmessage?.({ data: JSON.stringify({ type: 'hello' }) });
        });

        expect(result.current.points).toHaveLength(0);
        expect(result.current.latest).toBeNull();
    });

    it('caps points at 120 (2 minutes of 1s ticks)', async () => {
        const { result } = renderHook(() => useStats());
        await waitFor(() => expect(result.current.connection).toBe('open'));

        const ws = FakeWebSocket.instances[0]!;
        for (let i = 0; i < 150; i++) {
            const snap = {
                total_packets: i, total_bytes: i * 100,
                tcp_packets: 0, udp_packets: 0, icmp_packets: 0, other_packets: 0,
                ipv4_packets: 0, non_ipv4_packets: 0,
                pps: 1, bps: 100, t: 1000 + i,
            };
            act(() => { ws.onmessage?.({ data: JSON.stringify({ type: 'snapshot', data: snap }) }); });
        }

        expect(result.current.points).toHaveLength(120);
        // Oldest should be the 30th message (150 - 120).
        expect(result.current.points[0]!.total_packets).toBe(30);
    });

    it('drops messages when bufferedAmount exceeds 1 MiB', async () => {
        const { result } = renderHook(() => useStats());
        await waitFor(() => expect(result.current.connection).toBe('open'));

        const ws = FakeWebSocket.instances[0]!;
        ws.bufferedAmount = 2 * 1024 * 1024;

        const snap = {
            total_packets: 1, total_bytes: 1,
            tcp_packets: 0, udp_packets: 0, icmp_packets: 0, other_packets: 0,
            ipv4_packets: 0, non_ipv4_packets: 0,
            pps: 0, bps: 0, t: 1000,
        };
        act(() => { ws.onmessage?.({ data: JSON.stringify({ type: 'snapshot', data: snap }) }); });

        expect(result.current.points).toHaveLength(0);
    });

    it('enters reconnecting state on close', async () => {
        const { result } = renderHook(() => useStats());
        await waitFor(() => expect(result.current.connection).toBe('open'));

        act(() => { FakeWebSocket.instances[0]!.close(); });

        expect(result.current.connection).toBe('reconnecting');
    });
});