// addon/tests/test_api.js
//
//   node --test addon/tests/test_api.js
//   SKIP_CAPTURE=1 node --test addon/tests/test_api.js

const test = require('node:test');
const assert = require('node:assert/strict');
const addon = require('../../build/Release/netsentinel_addon');

const SNAPSHOT_KEYS = [
    'total_packets', 'total_bytes',
    'tcp_packets', 'udp_packets', 'icmp_packets', 'other_packets',
    'ipv4_packets', 'non_ipv4_packets',
];

// Force-clean capture state without a check-then-act race. Always
// attempt the stop, swallow "not running".
async function ensureStopped() {
    try {
        await addon.stopCapture();
    } catch (err) {
        if (!/capture not running/.test(err.message)) throw err;
    }
}

test('exports the five expected functions', () => {
    for (const name of ['startCapture', 'stopCapture', 'onStats', 'getStats', 'isRunning']) {
        assert.equal(typeof addon[name], 'function', `missing export: ${name}`);
    }
});

test('getStats returns all eight fields as non-negative numbers', () => {
    const stats = addon.getStats();
    for (const k of SNAPSHOT_KEYS) {
        assert.equal(typeof stats[k], 'number', `${k} is ${typeof stats[k]}`);
        assert.ok(stats[k] >= 0, `${k} is negative`);
        assert.ok(Number.isFinite(stats[k]), `${k} not finite`);
    }
});

test('isRunning returns a boolean', () => {
    assert.equal(typeof addon.isRunning(), 'boolean');
});

test('startCapture returns a Promise (not a value)', async () => {
    const p = addon.startCapture(null);
    assert.ok(p instanceof Promise, `got ${typeof p}`);

    // Drain it before returning so no worker is still in flight when
    // the next test starts. Swallow expected failure on machines
    // without CAP_NET_RAW.
    try {
        await p;
        await ensureStopped();
    } catch {
        // Expected: capture_create fails without sudo.
    }
});

test('stopCapture while stopped rejects with "capture not running"', async () => {
    await ensureStopped();
    await assert.rejects(addon.stopCapture(), /capture not running/);
});

test('onStats with a non-function throws TypeError', () => {
    assert.throws(() => addon.onStats(null), (err) => err instanceof TypeError);
    assert.throws(() => addon.onStats('not a function'), (err) => err instanceof TypeError);
    assert.throws(() => addon.onStats(42), (err) => err instanceof TypeError);
});

test('startCapture with invalid interface rejects cleanly', async () => {
    await ensureStopped();

    await assert.rejects(
        addon.startCapture('does-not-exist0'),
        /capture_create failed/,
        'Should reject with capture_create failed'
    );

    // Verify it didn't leave a half-open capture context.
    assert.equal(addon.isRunning(), false,
        'Should not be running after failed start');
});

test('capture lifecycle: start → isRunning true → stop → isRunning false',
    { skip: process.env.SKIP_CAPTURE === '1' },
    async (t) => {
        await ensureStopped();
        try {
            const iface = await addon.startCapture('lo');
            assert.equal(typeof iface, 'string');
            assert.equal(addon.isRunning(), true);
            await addon.stopCapture();
            assert.equal(addon.isRunning(), false);
        } catch (err) {
            if (err.message && err.message.includes('sudo')) {
                t.skip('requires sudo for raw socket');
                return;
            }
            throw err;
        }
    });