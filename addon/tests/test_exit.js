// addon/tests/test_exit.js
//
// Verifies that process.exit(0) without calling stopCapture does not
// crash. The addon must handle env teardown gracefully even with a
// ticker thread still alive and a TSFN still registered.
//
// This test deliberately does NOT clean up: it leaves capture running
// and calls process.exit(0) to force env teardown, which is exactly
// the scenario that previously triggered SIGABRT.

const test = require('node:test');
const assert = require('node:assert/strict');
const addon = require('../../build/Release/netsentinel_addon');

test('process.exit(0) without stopCapture does not crash',
    { skip: process.env.SKIP_CAPTURE === '1' },
    async () => {
        // Guarantee clean start.
        try { await addon.stopCapture(); } catch {}

        let ticks = 0;
        addon.onStats(() => { ticks++; }, 100);

        await addon.startCapture('lo');
        assert.equal(addon.isRunning(), true, 'capture should be running');

        // Wait for at least one tick so the ticker thread is demonstrably
        // alive at exit time. Without this, the test could pass trivially
        // because the ticker never got a chance to run.
        await new Promise((r) => setTimeout(r, 300));
        assert.ok(ticks >= 1, `expected >=1 tick before exit, got ${ticks}`);

        // Deliberately leak: capture is still running, ticker is still
        // alive, TSFN is still registered. The env cleanup path must
        // handle all three. If it doesn't, the process aborts with
        // "terminate called without an active exception" and this test
        // (and the whole suite) fails.
        //
        // We don't assert anything after exit — the exit code itself is
        // the assertion. A clean exit (0) means teardown worked.
        process.exit(0);
    });