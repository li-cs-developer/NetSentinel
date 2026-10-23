// addon/tests/test_swap.js
const test = require('node:test');
const assert = require('node:assert/strict');
const addon = require('../../build/Release/netsentinel_addon');

test('onStats(cb2) replaces cb1: cb1 stops firing, cb2 starts',
    { skip: process.env.SKIP_CAPTURE === '1' },
    async () => {
        // Guarantee clean state.
        try { await addon.stopCapture(); } catch {}

        const cb1Ticks = [];
        const cb2Ticks = [];

        addon.onStats((s) => cb1Ticks.push(s.total_packets), 100);
        await addon.startCapture('lo');

        // Wait for at least 2 cb1 ticks.
        await new Promise((r) => setTimeout(r, 300));
        assert.ok(cb1Ticks.length >= 2,
            `cb1 should have fired ≥2 times, got ${cb1Ticks.length}`);

        const cb1CountAtSwap = cb1Ticks.length;

        // Swap.
        addon.onStats((s) => cb2Ticks.push(s.total_packets), 100);

        // Wait for at least 2 cb2 ticks.
        await new Promise((r) => setTimeout(r, 300));
        assert.ok(cb2Ticks.length >= 2,
            `cb2 should have fired ≥2 times, got ${cb2Ticks.length}`);
        assert.equal(cb1Ticks.length, cb1CountAtSwap,
            `cb1 kept firing after swap: ${cb1CountAtSwap} → ${cb1Ticks.length}`);

        await addon.stopCapture();
    });

test.after(() => {
    // TSFN still holds the loop; force exit after tests settle.
    setTimeout(() => process.exit(0), 100).unref();
});