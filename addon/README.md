# NetSentinel Node-API Addon

Bridges the C packet-capture engine (`../engine/src`) into Node.js via
`node-addon-api`. Exposes a small async API for starting and stopping
capture and for streaming per-interval statistics to JavaScript.

## Public API

All functions are exported from `require('./build/Release/netsentinel_addon')`.

### `startCapture(iface?: string) -> Promise<string>`

Starts capturing on `iface`. If `iface` is `null`, `undefined`, or the
empty string, the addon auto-detects a default interface (first non-
loopback interface with an IPv4 address).

- Resolves with the interface name that is actually being captured.
- Rejects with `"capture already running"` if a capture is already active.
- Rejects with `"capture_create failed (interface? sudo?)"` if the socket
  cannot be opened (typically: not running as root, or bad interface name).
- Rejects with `"capture_start failed"` if the capture thread fails to start.

Requires `CAP_NET_RAW`. Run under `sudo`, or grant the capability once:

    sudo setcap cap_net_raw,cap_net_admin=eip "$(which node)"

### `stopCapture() -> Promise<void>`

Stops the active capture and joins the ticker thread.

- Resolves when capture was running and stopped cleanly.
- Rejects with `"capture not running"` if nothing was running.

### `onStats(cb: (snapshot) => void, intervalMs?: number) -> void`

Registers (or replaces) the stats callback. `intervalMs` defaults to
`1000`; values are clamped to `[50, 60000]`.

- The callback fires on the JS thread every `intervalMs` while a capture
  is active.
- Calling `onStats` again with a new function replaces the previous one;
  the old callback stops firing immediately.
- Does not start capture. If capture is not running, registering a
  callback starts the ticker, but no snapshots are pushed until
  `startCapture` runs (there are no packets to report, so the snapshots
  are all zeros — valid but not useful).
- Throws `TypeError` if `cb` is not a function.
- Throws `"addon is shutting down"` if called after env cleanup has begun.

The snapshot object has eight `number` fields, all monotonically non-
decreasing within a single capture session and never negative:

    total_packets     total bytes seen across all packets
    total_bytes
    tcp_packets       counts by IP protocol (6 / 17 / 1)
    udp_packets
    icmp_packets
    other_packets     protocols other than TCP/UDP/ICMP
    ipv4_packets      IPv4 frames successfully parsed
    non_ipv4_packets  non-IPv4 frames (IPv6, ARP, etc.)

### `getStats() -> object`

Synchronous snapshot of the current counters, same shape as the object
delivered to `onStats`. Cheap (a mutex-guarded copy); safe to call at
any frequency.

### `isRunning() -> boolean`

`true` if a capture context is active.

## Layout

    addon/
    ├── src/
    │   ├── addon.cpp            NAPI entry, exports, env cleanup hook
    │   ├── capture_manager.h    capture_ctx_t lifecycle (public header)
    │   ├── capture_manager.cpp  g_capture_mu, on_packet_cb
    │   ├── stats_publisher.h    ticker + TSFN lifecycle (public header)
    │   ├── stats_publisher.cpp  g_lifecycle_mu, g_tsfn_mu, tick loop
    │   └── snapshot_to_object.h single conversion from C to JS object
    ├── tests/
    │   ├── test_api.js          7 tests — public API contract
    │   ├── test_concurrency.js  5 tests — races under Promise.all()
    │   ├── test_swap.js         1 test  — onStats replacement
    │   ├── test_cycle.js        1 test  — ticker restart after stop
    │   ├── test_exit.js         1 test  — process.exit without stop
    │   └── test_addon.js        interactive demo (see below)
    ├── test_addon.js            interactive demo (moved: see note)
    └── package.json             test scripts

Only `addon.cpp` includes `<napi.h>` at the top. The other files include
it through their respective headers, which keeps the `-Wshadow` pragma
around the addon-api include in one place.

## Threading contract

Three mutexes and three `std::atomic` flags. The invariants below are
what make the addon safe under concurrent JS calls and shutdown. If you
change any of them, update this section and re-run
`tests/test_concurrency.js`.

### Capture lifecycle — `capture_manager`

- `g_capture` (`std::atomic<capture_ctx_t*>`) holds the live context.
- `g_capture_mu` (`std::mutex`) serializes **check-and-set** and
  **exchange-to-null** transitions.
- Consequence: concurrent `startCapture` calls — exactly one succeeds,
  the rest see `"capture already running"`. Concurrent `startCapture`
  and `stopCapture` — whichever acquires the mutex first wins; the other
  sees the state that the winner left behind.
- `on_packet_cb` runs on the C capture thread (not the JS thread) and
  must never touch N-API. It only calls `parse_ethernet_ipv4` and
  `stats_record_ipv4` / `stats_record_other`.

### Ticker lifecycle — `stats_publisher`

- `g_ticker` (`std::thread*`) is heap-allocated. It is not a value,
  deliberately, so that a `std::thread` destructor can never fire on a
  joinable thread during static teardown (`process.exit` races the
  cleanup hook; heap allocation removes that failure mode).
- `g_lifecycle_mu` guards `g_ticker` and the run flag.
- `stop_ticker()` is two-phase: it flips the run flag and nulls the
  pointer under the lock, then joins the thread **outside** the lock.
  This prevents a slow thread exit from blocking a concurrent
  `subscribe`.
- `ensure_ticker()` refuses to start a new thread when
  `g_shutting_down` is set. This is how `process.exit` during a
  `startCapture` avoids leaving a running ticker.

### TSFN refcount — `stats_publisher`

- The `Napi::ThreadSafeFunction` is created with
  `initialThreadCount = 1` and a bounded queue of 16.
- `g_state.tsfn` is the sole holder of the "one thread" reference. It
  is released exactly once, either in `subscribe` (when replacing the
  callback) or in `shutdown_all`.
- The ticker copies the handle under `g_tsfn_mu` and calls
  `NonBlockingCall`. **The ticker must never call `Release()` on the
  copy.** The C++ copy does not acquire a reference, and `Release()`
  underflows the count — this caused a `SIGABRT` in `napi_release_
  threadsafe_function` on the second tick before it was removed.
- If the JS callback falls behind, `NonBlockingCall` returns
  `napi_queue_full` and the tick is dropped. The frontend sees a gap,
  which is the correct behavior for a monitoring stream — a three-
  second-old snapshot is not worth delivering when a fresh one is
  queued behind it.

### Shutdown ordering — `addon.cpp`

`EnvCleanup` calls `stats_publisher::shutdown_all()` **before**
`capture_manager::shutdown()`:

1. `shutdown_all` sets `g_shutting_down`, joins the ticker, marks the
   TSFN as unavailable. After this returns, no thread is inside
   `NonBlockingCall`.
2. `shutdown` destroys any live capture context.

The order matters: if the capture context were destroyed first, its
capture thread could still be running `on_packet_cb` (which takes
`g_stats_lock`) while the ticker joined. In practice this happened to
work, but the ordering was load-bearing and undocumented. It is now
documented and enforced.

## Tests

    cd addon
    npm test               # 14 tests across 4 files, needs sudo/CAP_NET_RAW

`npm test` runs each test file in its own `node --test` process:

    sudo bash -c 'for f in \
        tests/test_api.js \
        tests/test_concurrency.js \
        tests/test_swap.js \
        tests/test_cycle.js \
        tests/test_exit.js; do
      node --test "$f" || exit 1
    done'

The per-file process boundary is load-bearing for `test_exit.js`. That
test calls `process.exit(0)` inside the test body to verify the env
cleanup hook tears down without hanging or aborting. If you run it in
the same `node --test` invocation as other files, the runner exits
inside `test_exit.js` and never executes the files after it. Batching
files is therefore forbidden — keep the loop.

Individual files:

    sudo node --test tests/test_api.js
    sudo node --test tests/test_concurrency.js
    sudo node --test tests/test_swap.js
    sudo node --test tests/test_cycle.js

`tests/test_exit.js` is **run separately**, for the same reason:

    sudo node --test tests/test_exit.js

The concurrency tests document the JS-visible manifestations of the
threading contract above. They do not prove the absence of data races
at the C++ level — for that, build with `-fsanitize=thread` and run
`tests/test_concurrency.js` under the instrumented addon.

## Demo

    cd addon
    npm run demo            # or: sudo node tests/test_addon.js lo

`tests/test_addon.js` is a **manual demo**, not an automated test. It
opens a live capture and prints a tick line every second with all
eight counters, then waits for you to press Ctrl-C. Because it blocks
indefinitely, `npm test` does not run it, and `test/run.sh` does not
run it. Start it in a terminal when you want to eyeball the counters
in real time. Generate traffic from another terminal:

    ping -c 5 127.0.0.1
    curl -s https://example.com > /dev/null

## Known limitations

- **No `offStats()`.** Calling `onStats` replaces the callback but does
  not release the previous TSFN's reference. A Node process that calls
  `onStats` will not exit until the environment is torn down
  (`process.exit`) or another `onStats` replaces it. This is fine for
  the server (kept alive by its HTTP listener) but requires a
  `test.after` hook in `test_concurrency.js` and `test_swap.js`. Add
  `offStats()` when a consumer needs it.

- **IPv4 only.** `parse_ethernet_ipv4` rejects anything that is not
  Ethernet-encapsulated IPv4. IPv6, ARP, VLAN-tagged frames, and Wi-Fi
  monitor-mode 802.11 frames are all classified as `non_ipv4_packets`
  and not further inspected. Adding IPv6 parsing is a parser change,
  not an addon change.

- **Wi-Fi limitation.** On a Wi-Fi interface in managed mode, the
  driver delivers only your own traffic and management frames to
  `AF_PACKET`. Pings to `8.8.8.8` through a Wi-Fi card will show up in
  `icmp_packets`; other stations' traffic will not. Use an Ethernet
  interface or `lo` for testing, or `iw dev <if> set type monitor`
  (which changes the frame format to radiotap/802.11 and requires a
  different parser).

- **Counters do not reset on `stopCapture`.** `test_cycle.js` relies on
  this: tick totals continue climbing across a stop → start. A reset
  would require a `stats_reset()` call and an API change.