#ifndef STATS_H
#define STATS_H

#include <stdint.h>

#define TOP_PORTS_CAP 16

typedef struct {
    uint64_t total_packets;
    uint64_t total_bytes;

    uint64_t tcp_packets;
    uint64_t udp_packets;
    uint64_t icmp_packets;
    uint64_t other_packets;

    /* IPv4 vs non-IPv4 (IPv6, ARP, etc. — counted as "other") */
    uint64_t ipv4_packets;
    uint64_t non_ipv4_packets;

} stats_snapshot_t;

/* Called from the capture thread on every packet. Thread-safe. */
void stats_record_ipv4(uint32_t caplen, uint8_t proto, uint16_t dst_port);
void stats_record_other(uint32_t caplen);

/* Snapshot current counters into *out. Thread-safe. */
void stats_snapshot(stats_snapshot_t *out);

/* Reset all counters. Thread-safe. */
void stats_reset(void);

#endif