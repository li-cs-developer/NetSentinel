// test/integration/test_http.js
//
// Requires a running server. Default target is http://localhost:3000,
// overridable via API_BASE env var.
//
// Precondition: the server must have been started with
// CAPTURE_INTERFACE=lo (as test/run.sh does). If it was started without
// a capture interface, `wasRunning` will be false and the "stop while
// running" case is skipped — the other assertions still pass, but that
// one won't be exercised.
//
//   Terminal 1: sudo API_TOKEN=dev-token-change-me CAPTURE_INTERFACE=lo PORT=3000 node server/dist/index.js
//   Terminal 2: node test/integration/test_http.js

const BASE = process.env.API_BASE || 'http://localhost:3000';
const TOKEN = process.env.API_TOKEN || 'dev-token-change-me';

// Auth header bundle. Reused by every /api/stats request.
const authHeaders = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
};

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

async function jsonOrThrow(r, name) {
    const text = await r.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`${name}: non-JSON response (status ${r.status}): ${text.slice(0, 100)}`);
    }
}

const SNAPSHOT_KEYS = [
    'total_packets', 'total_bytes',
    'tcp_packets', 'udp_packets', 'icmp_packets', 'other_packets',
    'ipv4_packets', 'non_ipv4_packets',
];

(async () => {
    // ── health (public — no token required) ────────────────
    await check('GET /api/health → 200, correct shape', async () => {
        const r = await fetch(`${BASE}/api/health`);
        assert(r.status === 200, `status ${r.status}`);
        assert((r.headers.get('content-type') || '').includes('application/json'),
            `content-type: ${r.headers.get('content-type')}`);
        const j = await jsonOrThrow(r, 'health');
        assert(j.status === 'ok', `status field: ${j.status}`);
        assert(Number.isInteger(j.uptime_s) && j.uptime_s >= 0, `uptime_s: ${j.uptime_s}`);
        assert(typeof j.capture_running === 'boolean', `capture_running: ${typeof j.capture_running}`);
        assert(typeof j.node_version === 'string' && j.node_version.startsWith('v'),
            `node_version: ${j.node_version}`);
    });

    // ── stats shape ────────────────────────────────────────
    await check('GET /api/stats → 200, all snapshot keys present as numbers', async () => {
        const r = await fetch(`${BASE}/api/stats`, { headers: authHeaders });
        assert(r.status === 200, `status ${r.status}`);
        const j = await jsonOrThrow(r, 'stats');
        for (const k of SNAPSHOT_KEYS) {
            assert(k in j, `missing key ${k}`);
            assert(typeof j[k] === 'number', `${k} is ${typeof j[k]}, expected number`);
            assert(j[k] >= 0, `${k} is negative: ${j[k]}`);
            assert(Number.isFinite(j[k]), `${k} not finite: ${j[k]}`);
        }
    });

    await check('GET /api/stats → counters are monotonically non-decreasing', async () => {
        const a = await (await fetch(`${BASE}/api/stats`, { headers: authHeaders })).json();
        await new Promise((r) => setTimeout(r, 300));
        const b = await (await fetch(`${BASE}/api/stats`, { headers: authHeaders })).json();
        for (const k of SNAPSHOT_KEYS) {
            assert(b[k] >= a[k], `${k} decreased: ${a[k]} → ${b[k]}`);
        }
    });

    await check('GET /api/stats → total_packets >= tcp + udp + icmp + other (invariant)', async () => {
        const j = await (await fetch(`${BASE}/api/stats`, { headers: authHeaders })).json();
        const l4sum = j.tcp_packets + j.udp_packets + j.icmp_packets + j.other_packets;
        // ipv4 only: the four L4 buckets plus other protocol numbers.
        assert(j.total_packets >= l4sum,
            `total(${j.total_packets}) < l4sum(${l4sum})`);
        assert(j.total_packets >= j.ipv4_packets,
            `total(${j.total_packets}) < ipv4(${j.ipv4_packets})`);
    });

    // ── capture state machine ──────────────────────────────
    // The current state depends on how the server was started. If
    // CAPTURE_INTERFACE=lo was set (as in test/run.sh), capture is
    // running by default. Otherwise, it's stopped and the "stop while
    // running" case is skipped.
    const initial = await (await fetch(`${BASE}/api/health`)).json();
    const wasRunning = initial.capture_running;

    if (wasRunning) {
        await check('POST /api/stats/capture/stop while running → 204', async () => {
            const r = await fetch(`${BASE}/api/stats/capture/stop`, {
                method: 'POST',
                headers: authHeaders,
            });
            assert(r.status === 204, `status ${r.status}`);
        });
    }

    await check('POST /api/stats/capture/stop while stopped → 409', async () => {
        const r = await fetch(`${BASE}/api/stats/capture/stop`, {
            method: 'POST',
            headers: authHeaders,
        });
        assert(r.status === 409, `status ${r.status}`);
        const j = await jsonOrThrow(r, 'stop-stopped');
        assert(typeof j.error === 'string', `error field: ${typeof j.error}`);
    });

    await check('POST /api/stats/capture/start while stopped → 201, returns interface', async () => {
        const r = await fetch(`${BASE}/api/stats/capture/start`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ interface: 'lo' }),
        });
        assert(r.status === 201, `status ${r.status}`);
        const j = await jsonOrThrow(r, 'start');
        assert(typeof j.interface === 'string' && j.interface.length > 0,
            `interface: ${JSON.stringify(j)}`);
    });

    await check('POST /api/stats/capture/start while running → 409', async () => {
        const r = await fetch(`${BASE}/api/stats/capture/start`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ interface: 'lo' }),
        });
        assert(r.status === 409, `status ${r.status}`);
        const j = await jsonOrThrow(r, 'start-running');
        assert(typeof j.error === 'string', `error field: ${typeof j.error}`);
    });

    await check('GET /api/health reflects state transition (capture_running=true)', async () => {
        const r = await fetch(`${BASE}/api/health`);
        const j = await r.json();
        assert(j.capture_running === true, `capture_running: ${j.capture_running}`);
    });

    // ── additional state-machine coverage ──────────────────
    await check('POST /api/stats/capture/stop twice → 204 then 409', async () => {
        const r1 = await fetch(`${BASE}/api/stats/capture/stop`, {
            method: 'POST',
            headers: authHeaders,
        });
        assert([204, 409].includes(r1.status), `first stop: ${r1.status}`);
        const r2 = await fetch(`${BASE}/api/stats/capture/stop`, {
            method: 'POST',
            headers: authHeaders,
        });
        assert(r2.status === 409, `second stop: ${r2.status}`);
    });

    await check('POST /api/stats/capture/start → 201', async () => {
        const r = await fetch(`${BASE}/api/stats/capture/start`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ interface: 'lo' }),
        });
        assert(r.status === 201, `status ${r.status}`);
        const j = await r.json();
        assert(j.interface === 'lo', `interface: ${j.interface}`);
    });

    // ── error handling ─────────────────────────────────────
    await check('GET /api/does-not-exist → 404 (not 500)', async () => {
        const r = await fetch(`${BASE}/api/does-not-exist`);
        assert(r.status === 404, `status ${r.status}`);
    });

    await check('POST /api/stats/capture/start with malformed JSON → 400 or 500', async () => {
        const r = await fetch(`${BASE}/api/stats/capture/start`, {
            method: 'POST',
            headers: authHeaders,
            body: '{not json',
        });
        assert(r.status === 400 || r.status === 500, `status ${r.status}`);
    });

    // ── summary ────────────────────────────────────────────
    console.log(`\nhttp: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();