#include "stats_publisher.h"

#include <atomic>
#include <chrono>
#include <mutex>
#include <thread>

extern "C" {
#include "stats.h"
}

#include "snapshot_to_object.h"

namespace netsentinel {

namespace {

struct State {
    Napi::ThreadSafeFunction tsfn;                   // JS thread only
    std::atomic<bool>        tsfn_ready{false};
    std::atomic<int>         interval_ms{1000};
};

State             g_state;
std::mutex        g_lifecycle_mu;
std::mutex        g_tsfn_mu;
std::thread*      g_ticker = nullptr;               // guarded by g_lifecycle_mu
std::atomic<bool> g_ticker_running{false};
std::atomic<bool> g_shutting_down{false};

void tick_loop()
{
    while (g_ticker_running.load(std::memory_order_acquire)) {
        int ms = g_state.interval_ms.load(std::memory_order_relaxed);
        int remaining = ms;
        while (remaining > 0 && g_ticker_running.load(std::memory_order_acquire)) {
            int s = remaining < 50 ? remaining : 50;
            std::this_thread::sleep_for(std::chrono::milliseconds(s));
            remaining -= s;
        }
        if (!g_ticker_running.load(std::memory_order_acquire)) break;

        Napi::ThreadSafeFunction local_tsfn;
        {
            std::lock_guard<std::mutex> lk(g_tsfn_mu);
            if (!g_state.tsfn_ready.load(std::memory_order_relaxed)) continue;
            local_tsfn = g_state.tsfn;
        }

        auto* payload = new stats_snapshot_t;
        stats_snapshot(payload);

        napi_status status = local_tsfn.NonBlockingCall(
            payload,
            [](Napi::Env env, Napi::Function js_cb, stats_snapshot_t* data) {
                js_cb.Call({ snapshot_to_object(env, *data) });
                delete data;
            });

        if (status != napi_ok) {
            delete payload;
            if (status == napi_closing) {
                g_ticker_running.store(false, std::memory_order_release);
                break;
            }
            if (status == napi_queue_full) {
                // Backpressure: JS callback is slow. Skip this tick
                // rather than accumulating snapshots.
            }
        }
        // No local_tsfn.Release() here — the copy does not acquire a
        // reference, and NonBlockingCall manages the count itself.
    }
}

} // namespace

void ensure_ticker()
{
    std::lock_guard<std::mutex> lk(g_lifecycle_mu);
    if (g_ticker) return;
    if (g_shutting_down.load(std::memory_order_acquire)) return;
    g_ticker_running.store(true, std::memory_order_release);
    g_ticker = new std::thread(tick_loop);
}

void stop_ticker()
{
    std::thread* to_join = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_lifecycle_mu);
        g_ticker_running.store(false, std::memory_order_release);
        to_join = g_ticker;
        g_ticker = nullptr;
    }
    if (!to_join) return;
    try {
        if (to_join->joinable()) to_join->join();
    } catch (...) {
        // join() can throw std::system_error; swallow — teardown path.
    }
    delete to_join;
}

bool is_shutting_down()
{
    return g_shutting_down.load(std::memory_order_acquire);
}

void subscribe(Napi::Env env, Napi::Function cb, int interval_ms)
{
    if (g_shutting_down.load(std::memory_order_acquire)) {
        Napi::Error::New(env, "addon is shutting down")
            .ThrowAsJavaScriptException();
        return;
    }

    g_state.interval_ms.store(interval_ms, std::memory_order_relaxed);

    stop_ticker();

    Napi::ThreadSafeFunction new_tsfn = Napi::ThreadSafeFunction::New(
        env, cb, "NetSentinelStats",
        /* maxQueueSize */ 16,
        /* initialThreadCount */ 1);

    {
        std::lock_guard<std::mutex> lk(g_tsfn_mu);
        if (g_state.tsfn_ready.exchange(false, std::memory_order_acq_rel)) {
            g_state.tsfn.Release();
        }
        g_state.tsfn = new_tsfn;
        g_state.tsfn_ready.store(true, std::memory_order_release);
    }

    ensure_ticker();
}

void shutdown_all()
{
    g_shutting_down.store(true, std::memory_order_release);

    try { stop_ticker(); } catch (...) {}

    {
        std::lock_guard<std::mutex> lk(g_tsfn_mu);
        g_state.tsfn_ready.store(false, std::memory_order_release);
        // Do not Release() here — env is dying, libuv handles it.
    }
}

} // namespace netsentinel