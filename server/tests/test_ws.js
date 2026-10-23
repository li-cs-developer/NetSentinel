// test/integration/test_ws.js
//
// Requires a running server with capture active (test_http.js leaves it in
// that state if you run http first). Default URL ws://localhost:3000/ws,
// overridable via WS_URL env var.
//
//   Terminal 1: sudo API_TOKEN=dev-token-change-me CAPTURE_INTERFACE=lo PORT=3000 node server/dist/index.js
//   Terminal 2: node test/integration/test_ws.js

import WebSocket from 'ws';

const BASE_URL = process.env.WS_URL || 'ws://localhost:3000/ws';
const TOKEN = process.env.API_TOKEN || 'dev-token-change-me';

// Append the token as a query parameter. Browsers can't set custom
// headers on a WebSocket handshake, so the token rides in the URL.
// `ws` (the client library) can set headers, but mirroring the
// browser's constraint keeps test and prod behaviour identical.
const URL = `${BASE_URL}?token=${encodeURIComponent(TOKEN)}`;

const TARGET_SNAPSHOTS = 5;
const PER_CLIENT_TIMEOUT_MS = 10_000;
const CONCURRENT_CLIENTS = 3;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function check(name, fn) {
    try {
        await fn();
        console.log(`ok    ${name}`);
        passed++;
    } catch (err) {
        console.error(`FAIL  ${name}: ${err.message}`);
        failed++;
    }
}

function openClient(url = URL) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
            try { ws.terminate(); } catch {}
            reject(new Error(`connect timeout after ${PER_CLIENT_TIMEOUT_MS}ms`));
        }, PER_CLIENT_TIMEOUT_MS);

        ws.once('open', () => { clearTimeout(timer); resolve(ws); });
        ws.once('error', (err) => { clearTimeout(timer); reject(err); });
    });
}

/**
 * Collect N snapshots from an already-open socket.
 * Enforces: envelope {type, data}, all SNAPSHOT_KEYS present as numbers.
 */
function collectSnapshots(ws, n, timeoutMs = PER_CLIENT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const snapshots = [];
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(
                `timeout: received ${snapshots.length}/${n} snapshots in ${timeoutMs}ms`));
        }, timeoutMs);

        function onMessage(raw) {
            let msg;
            try { msg = JSON.parse(raw.toString()); }
            catch (e) { cleanup(); reject(new Error(`non-JSON message: ${raw.toString().slice(0, 80)}`)); return; }

            if (msg.type !== 'snapshot') {
                // Envelope discriminator exists but we only expect snapshots here.
                cleanup();
                reject(new Error(`unexpected message type: ${msg.type}`));
                return;
            }
            if (!msg.data || typeof msg.data !== 'object') {
                cleanup();
                reject(new Error('missing data field'));
                return;
            }
            for (const k of SNAPSHOT_KEYS) {
                if (typeof msg.data[k] !== 'number') {
                    cleanup();
                    reject(new Error(`snapshot.${k} is ${typeof msg.data[k]}`));
                    return;
                }
            }
            snapshots.push(msg.data);
            if (snapshots.length >= n) { cleanup(); resolve(snapshots); }
        }

        function onClose() {
            if (snapshots.length < n) {
                cleanup();
                reject(new Error(`closed after ${snapshots.length}/${n} snapshots`));
            }
        }

        function cleanup() {
            clearTimeout(timer);
            ws.off('message', onMessage);
            ws.off('close', onClose);
        }

        ws.on('message', onMessage);
        ws.on('close', onClose);
    });
}

const SNAPSHOT_KEYS = [
    'total_packets', 'total_bytes',
    'tcp_packets', 'udp_packets', 'icmp_packets', 'other_packets',
    'ipv4_packets', 'non_ipv4_packets',
];

(async () => {
    // ── 1. connect ─────────────────────────────────────────
    let ws;
    await check('connect to /ws succeeds', async () => {
        ws = await openClient();
    });

    if (!ws) {
        console.error('\nws: cannot continue without a connection');
        console.log(`ws: ${passed} passed, ${failed} failed`);
        process.exit(1);
    }

    // ── 2. initial snapshot on connect ─────────────────────
    // The broadcaster sends a snapshot immediately on connection.
    await check('first message arrives within 2s of connect', async () => {
        const [first] = await collectSnapshots(ws, 1, 2000);
        assert(typeof first.total_packets === 'number', 'total_packets missing');
    });

    // ── 3. periodic broadcast ──────────────────────────────
    await check(`receives ${TARGET_SNAPSHOTS} snapshots at ~500ms cadence`, async () => {
        const start = Date.now();
        const snaps = await collectSnapshots(ws, TARGET_SNAPSHOTS);
        const elapsed = Date.now() - start;
        // 5 snapshots at 500ms = ~2500ms. Allow generous slack.
        assert(elapsed >= 1500, `arrived too fast: ${elapsed}ms for ${TARGET_SNAPSHOTS}`);
        assert(elapsed <= 8000, `arrived too slow: ${elapsed}ms for ${TARGET_SNAPSHOTS}`);
    });

    // ── 4. snapshot content invariants ─────────────────────
    await check('snapshot totals are monotonically non-decreasing', async () => {
        const snaps = await collectSnapshots(ws, 3);
        for (let i = 1; i < snaps.length; i++) {
            for (const k of SNAPSHOT_KEYS) {
                assert(snaps[i][k] >= snaps[i - 1][k],
                    `${k} decreased: ${snaps[i - 1][k]} → ${snaps[i][k]}`);
            }
        }
    });

    await check('snapshot fields are non-negative integers', async () => {
        const [s] = await collectSnapshots(ws, 1);
        for (const k of SNAPSHOT_KEYS) {
            assert(Number.isFinite(s[k]), `${k} not finite`);
            assert(s[k] >= 0, `${k} negative: ${s[k]}`);
        }
    });

    // ── 5. multiple concurrent clients ─────────────────────
    await check(`${CONCURRENT_CLIENTS} concurrent clients all receive snapshots`, async () => {
        const clients = await Promise.all(
            Array.from({ length: CONCURRENT_CLIENTS }, () => openClient())
        );
        try {
            const results = await Promise.all(
                clients.map((c) => collectSnapshots(c, 2))
            );
            for (let i = 0; i < results.length; i++) {
                assert(results[i].length === 2, `client ${i} got ${results[i].length}`);
            }
        } finally {
            for (const c of clients) { try { c.close(); } catch {} }
        }
    });

    // ── 6. clean close from client ─────────────────────────
    await check('client close does not error the server', async () => {
        const c = await openClient();
        await collectSnapshots(c, 1);
        await new Promise((resolve) => {
            c.once('close', resolve);
            c.close(1000, 'test done');
        });
        // Give the server a tick to process the close.
        await new Promise((r) => setTimeout(r, 100));
    });

    // ── 7. bad token is rejected with 1008 ─────────────────
    await check('WS connection with bad token is rejected (close 1008)', async () => {
        const badWs = new WebSocket(`${BASE_URL}?token=definitely-wrong-token`);
        const code = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                try { badWs.terminate(); } catch {}
                reject(new Error('expected close, timed out after 5s'));
            }, 5000);
            badWs.on('close', (c) => { clearTimeout(timer); resolve(c); });
            // Swallow error events; some WS implementations emit
            // 'error' alongside the close when a 1008 arrives during
            // the connection phase. We only care about the close code.
            badWs.on('error', () => {});
        });
        assert(code === 1008, `expected close code 1008, got ${code}`);
    });

    // ── 8. abrupt disconnect does not crash server ─────────
    await check('abrupt client disconnect does not crash the server', async () => {
        const c = await openClient();
        await collectSnapshots(c, 1);
        c.terminate(); // hard close, no handshake
        // Give the server time to process the 'close' event.
        await new Promise((r) => setTimeout(r, 100));
        // If the server crashed, this next request fails.
        const httpBase = BASE_URL.replace(/^ws/, 'http').replace(/\/ws.*$/, '');
        const r = await fetch(`${httpBase}/api/health`);
        assert(r.status === 200, `server crashed after abrupt disconnect (status ${r.status})`);
    });

    // ── 9. close the main socket ───────────────────────────
    await new Promise((resolve) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.once('close', resolve);
            ws.close(1000, 'test done');
        } else {
            resolve();
        }
    });

    // ── summary ────────────────────────────────────────────
    console.log(`\nws: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();