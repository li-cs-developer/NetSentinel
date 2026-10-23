import { useEffect, useRef, useState, useCallback } from 'react';
import { buildWsUrl } from '../api/client.js';
import type { StatsPoint, WsMessage } from '../api/types.js';

const MAX_POINTS = 120;       // 60 s at 500 ms cadence
const MAX_BUFFERED = 1 << 20; // 1 MiB — drop messages if the tab is behind

export type ConnectionState =
    | 'connecting'
    | 'open'
    | 'reconnecting'
    | 'closed';

interface UseStatsResult {
    points: StatsPoint[];
    latest: StatsPoint | null;
    connection: ConnectionState;
    error: string | null;
}

export function useStats(): UseStatsResult {
    const [points, setPoints] = useState<StatsPoint[]>([]);
    const [latest, setLatest] = useState<StatsPoint | null>(null);
    const [connection, setConnection] = useState<ConnectionState>('connecting');
    const [error, setError] = useState<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef(0);
    const stoppedRef = useRef(false);
    // Guards handlers against running after cleanup — React StrictMode
    // mounts, unmounts, and remounts in dev, and without this the
    // unmounted first mount could still call setState.
    const activeRef = useRef(false);

    const connect = useCallback(() => {
        if (stoppedRef.current) return;

        setConnection((c) => (c === 'open' ? c : 'connecting'));
        const ws = new WebSocket(buildWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
            if (!activeRef.current) return;
            retryRef.current = 0;
            setConnection('open');
            setError(null);
        };

        ws.onmessage = (evt) => {
            if (!activeRef.current) return;
            // If the client falls behind, bufferedAmount grows. Drop messages
            // rather than let memory accumulate.
            if (ws.bufferedAmount > MAX_BUFFERED) return;

            let msg: WsMessage;
            try {
                msg = JSON.parse(evt.data) as WsMessage;
            } catch {
                return;
            }
            if (msg.type !== 'snapshot') return;

            const point = msg.data;
            setLatest(point);
            setPoints((prev) => {
                const next = prev.length >= MAX_POINTS ? prev.slice(1) : prev.slice();
                next.push(point);
                return next;
            });
        };

        ws.onerror = () => {
            if (!activeRef.current) return;
            setError('WebSocket error');
        };

        ws.onclose = () => {
            if (!activeRef.current) return;
            wsRef.current = null;
            if (stoppedRef.current) {
                setConnection('closed');
                return;
            }
            // Exponential backoff capped at 8 s.
            const delay = Math.min(500 * 2 ** retryRef.current, 8000);
            retryRef.current++;
            setConnection('reconnecting');
            setTimeout(() => {
                if (activeRef.current) connect();
            }, delay);
        };
    }, []);

    useEffect(() => {
        activeRef.current = true;
        stoppedRef.current = false;
        connect();
        return () => {
            activeRef.current = false;
            stoppedRef.current = true;
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [connect]);

    return { points, latest, connection, error };
}