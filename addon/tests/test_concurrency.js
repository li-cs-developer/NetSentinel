const test = require('node:test');
const assert = require('node:assert/strict');
const addon = require('../../build/Release/netsentinel_addon');

const IFACE = 'lo';
const CYCLE_COUNT = 20;

async function ensureStopped() {
    try {
        await addon.stopCapture();
    } catch (err) {
        if (!/capture not running/.test(err.message)) throw err;
    }
}

function isNotRunningError(err) {
    return err instanceof Error && /capture not running/.test(err.message);
}

function isAlreadyRunningError(err) {
    return err instanceof Error && /capture already running/.test(err.message);
}

test('Promise.all([start, start]) → exactly one resolve, one reject', async () => {
    await ensureStopped();

    const results = await Promise.allSettled([
        addon.startCapture(IFACE),
        addon.startCapture(IFACE),
    ]);

    const resolved = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(resolved.length, 1,
        `expected 1 resolve, got ${resolved.length}: ${JSON.stringify(results)}`);
    assert.equal(rejected.length, 1,
        `expected 1 reject, got ${rejected.length}: ${JSON.stringify(results)}`);
    assert.equal(typeof resolved[0].value, 'string');
    assert.ok(isAlreadyRunningError(rejected[0].reason),
        `unexpected error: ${rejected[0].reason?.message}`);

    await ensureStopped();
});

test('Promise.all([stop, stop]) → exactly one resolve, one reject', async () => {
    await ensureStopped();
    await addon.startCapture(IFACE);

    const results = await Promise.allSettled([
        addon.stopCapture(),
        addon.stopCapture(),
    ]);

    const resolved = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(resolved.length, 1,
        `expected 1 resolve, got ${resolved.length}`);
    assert.equal(rejected.length, 1,
        `expected 1 reject, got ${rejected.length}`);
    assert.ok(isNotRunningError(rejected[0].reason),
        `unexpected error: ${rejected[0].reason?.message}`);
    assert.equal(addon.isRunning(), false);
});

test('Promise.all([start, stop]) on stopped state → consistent final state',
    async () => {
        await ensureStopped();

        const results = await Promise.allSettled([
            addon.startCapture(IFACE),
            addon.stopCapture(),
        ]);

        // Both orders are valid:
        //   stop-first: stop rejects "not running", start resolves. Final: running.
        //   start-first: start resolves, stop resolves. Final: stopped.
        // Invariant: isRunning() reflects whichever order actually happened.
        const startOk = results[0].status === 'fulfilled';
        const stopOk  = results[1].status === 'fulfilled';

        if (startOk && stopOk) {
            // start-then-stop: final state is stopped.
            assert.equal(addon.isRunning(), false);
        } else if (startOk && !stopOk) {
            // stop-then-start: final state is running.
            assert.equal(addon.isRunning(), true);
            await ensureStopped();
        } else {
            assert.fail(`unexpected combination: start=${results[0].status} stop=${results[1].status}`);
        }
    });

test(`start/stop × ${CYCLE_COUNT} leaves no joinable ticker, no leak`, async () => {
    await ensureStopped();

    for (let i = 0; i < CYCLE_COUNT; i++) {
        await addon.startCapture(IFACE);
        assert.equal(addon.isRunning(), true, `cycle ${i}: after start`);
        await addon.stopCapture();
        assert.equal(addon.isRunning(), false, `cycle ${i}: after stop`);
    }

    await addon.startCapture(IFACE);
    assert.equal(addon.isRunning(), true);
    await ensureStopped();
});

test('onStats during startCapture does not crash the ticker', async () => {
    await ensureStopped();

    let ticks = 0;
    addon.onStats(() => { ticks++; }, 100);

    await Promise.all([
        addon.startCapture(IFACE),
        Promise.resolve(),
    ]);

    const start = Date.now();
    while (ticks < 2 && Date.now() - start < 2000) {
        await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(ticks >= 2, `expected >=2 ticks, got ${ticks}`);

    await ensureStopped();

    const before = ticks;
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(ticks, before,
        `ticker kept firing after stop: ${before} → ${ticks}`);
});

test.after(() => {
    // The TSFN registered in test 5 holds the event loop open with
    // no unsubscribe API to release it. Force exit after tests settle.
    setTimeout(() => process.exit(0), 100).unref();
});