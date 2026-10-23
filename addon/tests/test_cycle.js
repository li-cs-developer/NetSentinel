// addon/tests/test_cycle.js
//
// Verifies that after stopCapture → startCapture, the ticker restarts
// even though onStats was only called once at the beginning.
//
// This catches the design bug where the ticker's lifecycle was tied
// only to onStats registration and not also to startCapture.

const test = require('node:test');
const assert = require('node:assert/strict');
const addon = require('../../build/Release/netsentinel_addon');

test('ticker restarts after stop → start (onStats registered once)',
    { skip: process.env.SKIP_CAPTURE === '1' },
    async () => {
        // Guarantee clean state.
        try { await addon.stopCapture(); } catch {}

        const ticks = [];
        addon.onStats((s) => ticks.push(s.total_packets), 200);

        // ── Cycle 1: start, wait for ticks, stop ───────────────
        await addon.startCapture('lo');
        const firstStartTicks = ticks.length;
        await new Promise((r) => setTimeout(r, 700));
        const afterFirstStart = ticks.length;
        assert.ok(afterFirstStart > firstStartTicks,
            `cycle 1: no ticks after start (${firstStartTicks} → ${afterFirstStart})`);

        await addon.stopCapture();
        const atFirstStop = ticks.length;

        // Wait to confirm ticks stopped while capture is off.
        await new Promise((r) => setTimeout(r, 400));
        assert.equal(ticks.length, atFirstStop,
            `cycle 1: ticks kept firing after stop (${atFirstStop} → ${ticks.length})`);

        // ── Cycle 2: start again — ticker must restart ─────────
        // This is the assertion that catches the original bug:
        // without the fix in StartWorker::OnOK, no ticks appear here.
        await addon.startCapture('lo');
        const secondStartTicks = ticks.length;
        await new Promise((r) => setTimeout(r, 700));
        const afterSecondStart = ticks.length;
        assert.ok(afterSecondStart > secondStartTicks,
            `cycle 2: ticker did not restart after start 2 ` +
            `(${secondStartTicks} → ${afterSecondStart}) — OnOK must call ensure_ticker_started`);

        await addon.stopCapture();

        // ── Final state ────────────────────────────────────────
        assert.equal(addon.isRunning(), false, 'capture should be stopped at end');
    });

test.after(() => {
    setTimeout(() => process.exit(0), 100).unref();
});