#ifndef _GNU_SOURCE
#  define _GNU_SOURCE
#endif
#include "parser.h"

#include <arpa/inet.h>
#include <netinet/if_ether.h>
#include <netinet/ip.h>
#include <netinet/tcp.h>
#include <netinet/udp.h>
#include <stdio.h>
#include <string.h>

static int g_failures = 0;
static int g_checks   = 0;

#define CHECK(cond, fmt, ...)                                         \
    do {                                                              \
        g_checks++;                                                   \
        if (!(cond)) {                                                \
            g_failures++;                                             \
            fprintf(stderr, "  FAIL %s:%d: " fmt "\n",                \
                    __FILE__, __LINE__, ##__VA_ARGS__);               \
        }                                                             \
    } while (0)

/* Fill `buf` with an Ethernet+IPv4+TCP frame. Returns total length. */
static size_t build_eth_ipv4_tcp(uint8_t *buf,
                                 uint8_t proto,
                                 uint32_t src_ip, uint32_t dst_ip,
                                 uint16_t sport, uint16_t dport,
                                 uint8_t ihl_words /* 5 = no options */)
{
    size_t eth_len = sizeof(struct ethhdr);
    size_t ip_len  = (size_t)ihl_words * 4;
    size_t tcp_len = sizeof(struct tcphdr);
    size_t total   = eth_len + ip_len + tcp_len;

    memset(buf, 0, total);

    /* Ethernet */
    memset(buf, 0xff, 6);                     /* dst */
    buf[6]=0x00; buf[7]=0x11; buf[8]=0x22;
    buf[9]=0x33; buf[10]=0x44; buf[11]=0x55;  /* src */
    buf[12]=0x08; buf[13]=0x00;               /* ETH_P_IP */

    /* IPv4 */
    buf[eth_len + 0] = (uint8_t)(0x40 | ihl_words);   /* version=4, ihl */
    buf[eth_len + 9] = proto;                          /* protocol */

    /* src/dst ip */
    memcpy(buf + eth_len + 12, &src_ip, 4);
    memcpy(buf + eth_len + 16, &dst_ip, 4);

    /* L4 (TCP/UDP both use src/dst at offset 0) */
    memcpy(buf + eth_len + ip_len + 0, &sport, 2);
    memcpy(buf + eth_len + ip_len + 2, &dport, 2);

    return total;
}

/* ---------------------------------------------------------------- */

static void test_tcp_basic(void)
{
    printf("test_tcp_basic\n");
    uint8_t frame[128];
    uint32_t src = htonl(0x0A000001);  /* 10.0.0.1 */
    uint32_t dst = htonl(0xC0A80101);  /* 192.168.1.1 */

    size_t n = build_eth_ipv4_tcp(frame, 6, src, dst,
                                  htons(12345), htons(80), 5);

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == 0,                     "rc=%d", rc);
    CHECK(pkt.ip_proto == 6,           "proto=%u", pkt.ip_proto);
    CHECK(pkt.src_port == 12345,       "sport=%u", pkt.src_port);
    CHECK(pkt.dst_port == 80,          "dport=%u", pkt.dst_port);
    CHECK(pkt.src_ip   == src,         "src_ip mismatch");
    CHECK(pkt.dst_ip   == dst,         "dst_ip mismatch");
}

static void test_udp_basic(void)
{
    printf("test_udp_basic\n");
    uint8_t frame[128];
    uint32_t src = htonl(0x08080808);  /* 8.8.8.8 */
    uint32_t dst = htonl(0x0A000002);

    size_t n = build_eth_ipv4_tcp(frame, 17, src, dst,
                                  htons(53), htons(5353), 5);

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == 0,               "rc=%d", rc);
    CHECK(pkt.ip_proto == 17,    "proto=%u", pkt.ip_proto);
    CHECK(pkt.src_port == 53,    "sport=%u", pkt.src_port);
    CHECK(pkt.dst_port == 5353,  "dport=%u", pkt.dst_port);
}

static void test_icmp_no_ports(void)
{
    printf("test_icmp_no_ports\n");
    uint8_t frame[128];
    uint32_t src = htonl(0x0A000001);
    uint32_t dst = htonl(0x08080808);

    /* ICMP: no ports. Just an 8-byte ICMP echo header after IPv4. */
    size_t n = build_eth_ipv4_tcp(frame, 1, src, dst, 0, 0, 5);
    /* shrink: caller buffer already has 20 bytes of "tcp" zeros after IPv4,
       so len is fine. Parser should accept and leave ports at 0. */

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == 0,               "rc=%d", rc);
    CHECK(pkt.ip_proto == 1,     "proto=%u", pkt.ip_proto);
    CHECK(pkt.src_port == 0,     "sport=%u (should be 0)", pkt.src_port);
    CHECK(pkt.dst_port == 0,     "dport=%u (should be 0)", pkt.dst_port);
}

static void test_options_ihl_6(void)
{
    printf("test_options_ihl_6\n");
    uint8_t frame[160];
    uint32_t src = htonl(0x01020304);
    uint32_t dst = htonl(0x05060708);

    /* ihl=6 → 24-byte IPv4 header (4 bytes of options). Ports must be
     * read from the correct, shifted L4 offset. */
    size_t n = build_eth_ipv4_tcp(frame, 6, src, dst,
                                  htons(40000), htons(443), 6);

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == 0,               "rc=%d", rc);
    CHECK(pkt.ip_proto == 6,     "proto=%u", pkt.ip_proto);
    CHECK(pkt.src_port == 40000, "sport=%u", pkt.src_port);
    CHECK(pkt.dst_port == 443,   "dport=%u", pkt.dst_port);
}

static void test_non_ipv4_ethertype(void)
{
    printf("test_non_ipv4_ethertype\n");
    uint8_t frame[64];
    memset(frame, 0, sizeof(frame));
    /* ARP EtherType 0x0806 */
    frame[12] = 0x08; frame[13] = 0x06;

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, sizeof(frame), &pkt);

    CHECK(rc == -1, "expected -1 for non-IPv4, got %d", rc);
}

static void test_truncated_too_short(void)
{
    printf("test_truncated_too_short\n");
    uint8_t frame[10];
    memset(frame, 0, sizeof(frame));

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, sizeof(frame), &pkt);

    CHECK(rc == -1, "expected -1 for too-short, got %d", rc);
}

static void test_truncated_tcp(void)
{
    printf("test_truncated_tcp\n");
    uint8_t frame[128];
    size_t n = build_eth_ipv4_tcp(frame, 6,
                                  htonl(1), htonl(2),
                                  htons(1234), htons(80), 5);

    /* Chop off the last 4 bytes of TCP header → should reject. */
    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n - 4, &pkt);

    CHECK(rc == -1, "expected -1 for truncated TCP, got %d", rc);
}

static void test_bad_version(void)
{
    printf("test_bad_version\n");
    uint8_t frame[128];
    size_t n = build_eth_ipv4_tcp(frame, 6,
                                  htonl(1), htonl(2),
                                  htons(80), htons(80), 5);

    /* Force version field to 6 (IPv6). Parser should reject. */
    frame[sizeof(struct ethhdr)] = 0x65; /* version=6, ihl=5 */

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == -1, "expected -1 for IPv6, got %d", rc);
}

static void test_bad_ihl(void)
{
    printf("test_bad_ihl\n");
    uint8_t frame[128];
    size_t n = build_eth_ipv4_tcp(frame, 6,
                                  htonl(1), htonl(2),
                                  htons(80), htons(80), 5);

    /* ihl=4 → 16-byte header, smaller than sizeof(struct iphdr). Reject. */
    frame[sizeof(struct ethhdr)] = 0x44;

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == -1, "expected -1 for ihl=4, got %d", rc);
}

static void test_zero_ports_tcp(void)
{
    printf("test_zero_ports_tcp\n");
    uint8_t frame[128];
    size_t n = build_eth_ipv4_tcp(frame, 6,
                                  htonl(1), htonl(2),
                                  htons(0), htons(0), 5);

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == 0,             "rc=%d", rc);
    CHECK(pkt.src_port == 0,   "sport=%u", pkt.src_port);
    CHECK(pkt.dst_port == 0,   "dport=%u", pkt.dst_port);
}

static void test_max_ports(void)
{
    printf("test_max_ports\n");
    uint8_t frame[128];
    size_t n = build_eth_ipv4_tcp(frame, 6,
                                  htonl(1), htonl(2),
                                  htons(65535), htons(65535), 5);

    parsed_packet_t pkt;
    int rc = parse_ethernet_ipv4(frame, n, &pkt);

    CHECK(rc == 0,                "rc=%d", rc);
    CHECK(pkt.src_port == 65535,  "sport=%u", pkt.src_port);
    CHECK(pkt.dst_port == 65535,  "dport=%u", pkt.dst_port);
}

/* ---------------------------------------------------------------- */

int main(void)
{
    test_tcp_basic();
    test_udp_basic();
    test_icmp_no_ports();
    test_options_ihl_6();
    test_non_ipv4_ethertype();
    test_truncated_too_short();
    test_truncated_tcp();
    test_bad_version();
    test_bad_ihl();
    test_zero_ports_tcp();
    test_max_ports();

    printf("\n%d checks, %d failures\n", g_checks, g_failures);
    return g_failures == 0 ? 0 : 1;
}