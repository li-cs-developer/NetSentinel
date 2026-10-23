#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wshadow"
#include <napi.h>
#pragma GCC diagnostic pop

#include <string>

#include "capture_manager.h"
#include "snapshot_to_object.h"
#include "stats_publisher.h"

extern "C" {
#include "stats.h"
}

namespace {

// ─── startCapture(iface?: string) -> Promise<string> ──────────────
class StartWorker : public Napi::AsyncWorker {
public:
    StartWorker(Napi::Env env, std::string iface)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)),
          iface_(std::move(iface)) {}

    Napi::Promise Promise() { return deferred_.Promise(); }

protected:
    void Execute() override
    {
        auto r = netsentinel::start(iface_);
        if (!r.ok) { SetError(r.error); return; }
        iface_name_ = r.iface;
    }

    void OnOK() override
    {
        if (!netsentinel::is_shutting_down()) {
            netsentinel::ensure_ticker();
        }
        deferred_.Resolve(Napi::String::New(Env(), iface_name_));
    }

    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

private:
    Napi::Promise::Deferred deferred_;
    std::string             iface_;
    std::string             iface_name_;
};

Napi::Value StartCapture(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    std::string iface;
    if (info.Length() > 0 && info[0].IsString())
        iface = info[0].As<Napi::String>().Utf8Value();
    auto* w = new StartWorker(env, std::move(iface));
    auto  p = w->Promise();
    w->Queue();
    return p;
}

// ─── stopCapture() -> Promise<void> ──────────────────────────────
class StopWorker : public Napi::AsyncWorker {
public:
    StopWorker(Napi::Env env)
        : Napi::AsyncWorker(env),
          deferred_(Napi::Promise::Deferred::New(env)) {}

    Napi::Promise Promise() { return deferred_.Promise(); }

protected:
    void Execute() override
    {
        netsentinel::stop_ticker();
        if (!netsentinel::stop()) {
            SetError("capture not running");
        }
    }
    void OnOK() override { deferred_.Resolve(Env().Undefined()); }
    void OnError(const Napi::Error& e) override { deferred_.Reject(e.Value()); }

private:
    Napi::Promise::Deferred deferred_;
};

Napi::Value StopCapture(const Napi::CallbackInfo& info)
{
    auto* w = new StopWorker(info.Env());
    auto  p = w->Promise();
    w->Queue();
    return p;
}

// ─── onStats(cb, intervalMs?) -> void ────────────────────────────
Napi::Value OnStats(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "onStats expects a function")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    int ms = 1000;
    if (info.Length() > 1 && info[1].IsNumber()) {
        ms = info[1].As<Napi::Number>().Int32Value();
        if (ms < 50)    ms = 50;
        if (ms > 60000) ms = 60000;
    }

    netsentinel::subscribe(env, info[0].As<Napi::Function>(), ms);
    return env.Undefined();
}

// ─── getStats() -> object ────────────────────────────────────────
Napi::Value GetStats(const Napi::CallbackInfo& info)
{
    stats_snapshot_t s;
    stats_snapshot(&s);
    return netsentinel::snapshot_to_object(info.Env(), s);
}

// ─── isRunning() -> boolean ──────────────────────────────────────
Napi::Value IsRunning(const Napi::CallbackInfo& info)
{
    return Napi::Boolean::New(info.Env(),
        netsentinel::current() != nullptr);
}

// ─── cleanup ─────────────────────────────────────────────────────
void EnvCleanup(void*)
{
    netsentinel::shutdown_all();
    netsentinel::shutdown();
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    napi_add_env_cleanup_hook(env, EnvCleanup, nullptr);
    exports.Set("startCapture", Napi::Function::New(env, StartCapture));
    exports.Set("stopCapture",  Napi::Function::New(env, StopCapture));
    exports.Set("onStats",      Napi::Function::New(env, OnStats));
    exports.Set("getStats",     Napi::Function::New(env, GetStats));
    exports.Set("isRunning",    Napi::Function::New(env, IsRunning));
    return exports;
}

} // namespace

NODE_API_MODULE(netsentinel_addon, Init)