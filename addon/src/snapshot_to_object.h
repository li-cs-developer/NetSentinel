#ifndef SNAPSHOT_TO_OBJECT_H
#define SNAPSHOT_TO_OBJECT_H

#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wshadow"
#include <napi.h>
#pragma GCC diagnostic pop

extern "C" {
#include "stats.h"
}

namespace netsentinel {

    inline Napi::Object snapshot_to_object(Napi::Env env, const stats_snapshot_t& s)
    {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("total_packets",     Napi::Number::New(env, static_cast<double>(s.total_packets)));
        obj.Set("total_bytes",       Napi::Number::New(env, static_cast<double>(s.total_bytes)));
        obj.Set("tcp_packets",       Napi::Number::New(env, static_cast<double>(s.tcp_packets)));
        obj.Set("udp_packets",       Napi::Number::New(env, static_cast<double>(s.udp_packets)));
        obj.Set("icmp_packets",      Napi::Number::New(env, static_cast<double>(s.icmp_packets)));
        obj.Set("other_packets",     Napi::Number::New(env, static_cast<double>(s.other_packets)));
        obj.Set("ipv4_packets",      Napi::Number::New(env, static_cast<double>(s.ipv4_packets)));
        obj.Set("non_ipv4_packets",  Napi::Number::New(env, static_cast<double>(s.non_ipv4_packets)));
        return obj;
    }

} // namespace netsentinel

#endif // SNAPSHOT_TO_OBJECT_H