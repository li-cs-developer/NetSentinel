import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { CaptureAddon, StatsSnapshot } from '../capture.js';
import { config } from '../config.js';
import { isWsAuthorized } from '../middleware/auth.js';

const ZERO_SNAPSHOT: StatsSnapshot = {
    total_packets: 0, total_bytes: 0,
    tcp_packets: 0, udp_packets: 0,
    icmp_packets: 0, other_packets: 0,
    ipv4_packets: 0, non_ipv4_packets: 0,
};

/**
 * Payload sent to every WS client each tick.
 *
 * pps / bps are computed server-side from consecutive getStats() calls.
 * The server is the only place that knows the true wall-clock delta
 * between two samples — computing rates client-side is wrong whenever
 * the tab is backgrounded (browsers throttle setState flushing but not
 * incoming WS messages, so N snapshots arrive in a burst and dt spans
 * minutes instead of 500 ms).
 *
 * t is the server's Date.now() at broadcast time. Clients should use it
 * for chart X positions rather than client-local time so a throttled
 * tab doesn't produce an axis that spans the whole backgrounded window.
 */
interface BroadcastPayload extends StatsSnapshot {
    pps: number;
    bps: number;
    t: number;
}

export class StatsBroadcaster {
    private readonly wss: WebSocketServer;
    private ticker: NodeJS.Timeout | null = null;

    // Rate state. Advanced only by tick(), never by the initial send
    // on connection — otherwise two clients connecting close together
    // would each advance prevSnapshot and corrupt the next tick's delta.
    private prevSnapshot: StatsSnapshot | null = null;
    private prevTime = 0;

    // The most recent payload, cached so new clients can get an instant
    // first snapshot without perturbing the rate state.
    private lastPayload: BroadcastPayload | null = null;

    constructor(
        httpServer: Server,
        private readonly addon: CaptureAddon,
    ) {
        this.wss = new WebSocketServer({
            server: httpServer,
            path: config.wsPath,
        });

        this.wss.on('connection', (ws, req) => {
            // Reject before sending any data if the upgrade didn't carry
            // a valid token. 1008 (policy violation) is the standard
            // "auth rejected" close code.
            if (config.apiToken && !isWsAuthorized(req.url)) {
                const ip = req.socket.remoteAddress ?? 'unknown';
                console.warn(`[ws] unauthorized connection attempt from ${ip}`);
                try { ws.close(1008, 'unauthorized'); } catch { /* ignore */ }
                return;
            }

            const ip = req.socket.remoteAddress ?? 'unknown';
            console.log(`[ws] client connected (${ip}), total=${this.wss.clients.size}`);

            try {
                ws.send(JSON.stringify({
                    type: 'snapshot',
                    data: this.currentPayload(),
                }));
            } catch (err) {
                console.error('[ws] initial send failed:', err);
            }

            ws.on('close', () => {
                console.log(`[ws] client disconnected, total=${this.wss.clients.size}`);
            });
            ws.on('error', (err) => {
                console.error('[ws] client error:', err.message);
            });
        });
    }

    start(): void {
        if (this.ticker) return;
        this.ticker = setInterval(() => this.broadcast(), config.statsIntervalMs);
        console.log(`[ws] broadcaster started (every ${config.statsIntervalMs}ms)`);
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.ticker) {
                clearInterval(this.ticker);
                this.ticker = null;
            }
            for (const ws of this.wss.clients) {
                try { ws.close(1001, 'server shutting down'); } catch { /* ignore */ }
            }
            this.wss.close(() => resolve());
        });
    }

    /**
     * Advance the rate state and return a payload. Called only from
     * broadcast(), so prevSnapshot/prevTime stay in lockstep with the
     * interval and never advance on a client connect.
     */
    private tick(): BroadcastPayload {
        const snap = this.safeSnapshot();
        const now = Date.now();
        let pps = 0;
        let bps = 0;

        if (this.prevSnapshot) {
            const dt = Math.max((now - this.prevTime) / 1000, 0.001);
            const dp = snap.total_packets - this.prevSnapshot.total_packets;
            const db = snap.total_bytes - this.prevSnapshot.total_bytes;
            // Counters reset to 0 on stats_reset(). Negative deltas would
            // report a huge bogus rate; clamp to 0 and let the next tick
            // recover once prevSnapshot is the post-reset value.
            if (dp >= 0) pps = dp / dt;
            if (db >= 0) bps = db / dt;
        }

        this.prevSnapshot = snap;
        this.prevTime = now;

        const payload: BroadcastPayload = { ...snap, pps, bps, t: now };
        this.lastPayload = payload;
        return payload;
    }

    /**
     * A new client gets the last broadcast if one exists, or a zero-rate
     * snapshot if the broadcaster hasn't started yet. Does not touch
     * prevSnapshot — safe to call any number of times.
     */
    private currentPayload(): BroadcastPayload {
        if (this.lastPayload) return this.lastPayload;
        return { ...this.safeSnapshot(), pps: 0, bps: 0, t: Date.now() };
    }

    private broadcast(): void {
        if (this.wss.clients.size === 0) return;

        let payload: string;
        try {
            payload = JSON.stringify({ type: 'snapshot', data: this.tick() });
        } catch (err) {
            console.error('[ws] serialize failed:', err);
            return;
        }

        for (const ws of this.wss.clients) {
            if (ws.readyState === WebSocket.OPEN) {
                try { ws.send(payload); } catch { /* handled by 'error' */ }
            }
        }
    }

    private safeSnapshot(): StatsSnapshot {
        try {
            return this.addon.getStats();
        } catch (err) {
            console.error('[ws] getStats failed:', err);
            return ZERO_SNAPSHOT;
        }
    }
}