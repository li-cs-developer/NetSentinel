#ifndef CAPTURE_MANAGER_H
#define CAPTURE_MANAGER_H

#include <string>

extern "C" {
#include "capture.h"
}

namespace netsentinel {

    // Result of a start attempt. Matches the three states the JS API can
    // surface: success, already running, or failure.
    struct StartResult {
        bool        ok = false;
        std::string iface;         // valid only if ok
        std::string error;         // valid only if !ok
    };

    // Start capturing on `iface` (empty string means auto-detect).
    // Serialized by an internal mutex; concurrent calls see "already running"
    // for the loser.
    StartResult start(const std::string& iface);

    // Stop the running capture. Returns false if nothing was running.
    // Serialized by the same mutex as start().
    bool stop();

    // Snapshot of the current capture context. nullptr if stopped.
    // Read of a std::atomic — safe from any thread.
    capture_ctx_t* current();

    // Interface name of the current context, or "" if stopped.
    std::string current_iface();

    // Destroy any running capture. Called from the env cleanup hook.
    // Idempotent; safe to call when already stopped.
    void shutdown();

} // namespace netsentinel

#endif // CAPTURE_MANAGER_H