#ifndef PARSER_H
#define PARSER_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    uint8_t  ip_proto;      /* 6=TCP, 17=UDP, 1=ICMP */
    uint16_t src_port;      /* 0 if not TCP/UDP */
    uint16_t dst_port;      /* 0 if not TCP/UDP */
    uint32_t src_ip;        /* network byte order */
    uint32_t dst_ip;        /* network byte order */
} parsed_packet_t;

/* Parse an Ethernet frame. Returns 0 on success, -1 if not IPv4
 * (caller should treat as "other"). `len` is captured length. */
int parse_ethernet_ipv4(const uint8_t *buf, size_t len, parsed_packet_t *out);

#endif