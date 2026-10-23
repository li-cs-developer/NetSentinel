const BASE = process.env.API_BASE || 'http://localhost:3000';
const TOKEN = process.env.API_TOKEN || 'dev-token-change-me';
let passed = 0; let failed = 0;

async function check(name, fn) {
    try { await fn(); console.log(`ok    ${name}`); passed++; }
    catch (err) { console.error(`FAIL  ${name}: ${err.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
    await check('GET /api/stats without token → 401', async () => {
        const r = await fetch(`${BASE}/api/stats`);
        assert(r.status === 401, `Expected 401, got ${r.status}`);
    });

    await check('GET /api/stats with bad token → 401', async () => {
        const r = await fetch(`${BASE}/api/stats`, { headers: { Authorization: 'Bearer wrong-token' } });
        assert(r.status === 401, `Expected 401, got ${r.status}`);
    });

    await check('GET /api/stats with valid token → 200', async () => {
        const r = await fetch(`${BASE}/api/stats`, { headers: { Authorization: `Bearer ${TOKEN}` } });
        assert(r.status === 200, `Expected 200, got ${r.status}`);
    });

    await check('GET /api/health requires no token (public)', async () => {
        const r = await fetch(`${BASE}/api/health`);
        assert(r.status === 200, `Expected 200, got ${r.status}`);
    });

    await check('Security headers are present', async () => {
        const r = await fetch(`${BASE}/api/health`);
        assert(r.headers.get('x-content-type-options') === 'nosniff', 'Missing nosniff');
        assert(r.headers.get('x-frame-options') === 'DENY', 'Missing DENY');
        assert(r.headers.get('content-security-policy')?.includes("default-src 'self'"), 'Missing CSP');
    });

    await check('CORS headers present in dev mode', async () => {
        const r = await fetch(`${BASE}/api/health`);
        // If NODE_ENV is development, this should be set.
        assert(r.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'Missing CORS header');
    });

    console.log(`\nsecurity: ${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
})();