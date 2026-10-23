#include "capture_manager.h"

#include <atomic>
#include <mutex>

extern "C" {
#include "parser.h"
#include "stats.h"
}

namespace netsentinel {

namespace {

std::atomic<capture_ctx_t*> g_capture{nullptr};
std::mutex                  g_capture_mu;

// Runs on the C capture thread. This is the only place packets are
// turned into stats.
extern "C" void on_packet_cb(const uint8_t* buf, uint32_t caplen, void*)
{
    parsed_packet_t pkt;
    if (parse_ethernet_ipv4(buf, caplen, &pkt) == 0) {
        stats_record_ipv4(caplen, pkt.ip_proto, pkt.dst_port);
    } else {
        stats_record_other(caplen);
    }
}

} // namespace

StartResult start(const std::string& iface)
{
    StartResult r;

    std::lock_guard<std::mutex> lk(g_capture_mu);
    if (g_capture.load(std::memory_order_acquire) != nullptr) {
        r.error = "capture already running";
        return r;
    }

    capture_ctx_t* ctx = capture_create(
        iface.empty() ? nullptr : iface.c_str(),
        on_packet_cb,
        nullptr);
    if (!ctx) {
        r.error = "capture_create failed (interface? sudo?)";
        return r;
    }
    if (capture_start(ctx) != 0) {
        capture_destroy(ctx);
        r.error = "capture_start failed";
        return r;
    }

    g_capture.store(ctx, std::memory_order_release);
    r.ok    = true;
    r.iface = capture_iface(ctx);
    return r;
}

bool stop()
{
    capture_ctx_t* ctx = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_capture_mu);
        ctx = g_capture.exchange(nullptr, std::memory_order_acq_rel);
    }
    if (!ctx) return false;
    capture_destroy(ctx);
    return true;
}

capture_ctx_t* current()
{
    return g_capture.load(std::memory_order_acquire);
}

std::string current_iface()
{
    capture_ctx_t* ctx = current();
    return ctx ? std::string(capture_iface(ctx)) : std::string();
}

void shutdown()
{
    capture_ctx_t* ctx = nullptr;
    {
        std::lock_guard<std::mutex> lk(g_capture_mu);
        ctx = g_capture.exchange(nullptr, std::memory_order_acq_rel);
    }
    if (ctx) capture_destroy(ctx);
}

} // namespace netsentinel