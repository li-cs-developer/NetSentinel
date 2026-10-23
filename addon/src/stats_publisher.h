#ifndef STATS_PUBLISHER_H
#define STATS_PUBLISHER_H

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wshadow"
#include <napi.h>
#pragma GCC diagnostic pop

#include <string>

namespace netsentinel {

    // Register (or replace) the stats callback. Starts the ticker if
    // capture is running. Called on the JS thread only.
    //
    // Throws a JS exception (returns via ThrowAsJavaScriptException) if
    // the addon is shutting down or cb is not a function.
    void subscribe(Napi::Env env, Napi::Function cb, int interval_ms);

    // Stop the ticker and join its thread. Does NOT release the TSFN —
    // callers must do that themselves (env_cleanup_hook, or future
    // offStats). Called on any thread.
    void stop_ticker();

    // Ensure the ticker thread exists. No-op if already running or if
    // shutting down. Called on any thread.
    void ensure_ticker();

    // True if the addon is in shutdown. Set by shutdown_all().
    bool is_shutting_down();

    // Set the shutdown flag, stop the ticker, release the TSFN.
    // Called from the env cleanup hook.
    void shutdown_all();

} // namespace netsentinel

#endif // STATS_PUBLISHER_H