#ifndef _GNU_SOURCE
#  define _GNU_SOURCE
#endif
#include "stats.h"

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

static void test_ipv4_tcp(void)
{
    printf("test_ipv4_tcp\n");
    stats_reset();
    stats_record_ipv4(100, 6, 80);

    stats_snapshot_t s;
    stats_snapshot(&s);

    CHECK(s.total_packets  == 1,    "total_packets=%llu", (unsigned long long)s.total_packets);
    CHECK(s.total_bytes    == 100,  "total_bytes=%llu",   (unsigned long long)s.total_bytes);
    CHECK(s.ipv4_packets   == 1,    "ipv4_packets=%llu",  (unsigned long long)s.ipv4_packets);
    CHECK(s.tcp_packets    == 1,    "tcp_packets=%llu",   (unsigned long long)s.tcp_packets);
    CHECK(s.udp_packets    == 0,    "udp_packets=%llu",   (unsigned long long)s.udp_packets);
    CHECK(s.icmp_packets   == 0,    "icmp_packets=%llu",  (unsigned long long)s.icmp_packets);
    CHECK(s.other_packets  == 0,    "other_packets=%llu", (unsigned long long)s.other_packets);
    CHECK(s.non_ipv4_packets == 0,  "non_ipv4=%llu",      (unsigned long long)s.non_ipv4_packets);
}

static void test_ipv4_udp(void)
{
    printf("test_ipv4_udp\n");
    stats_reset();
    stats_record_ipv4(64, 17, 53);

    stats_snapshot_t s;
    stats_snapshot(&s);

    CHECK(s.udp_packets  == 1, "udp_packets=%llu", (unsigned long long)s.udp_packets);
    CHECK(s.tcp_packets  == 0, "tcp_packets=%llu", (unsigned long long)s.tcp_packets);
    CHECK(s.icmp_packets == 0, "icmp_packets=%llu", (unsigned long long)s.icmp_packets);
}

static void test_ipv4_icmp(void)
{
    printf("test_ipv4_icmp\n");
    stats_reset();
    stats_record_ipv4(98, 1, 0);

    stats_snapshot_t s;
    stats_snapshot(&s);

    CHECK(s.icmp_packets == 1, "icmp_packets=%llu", (unsigned long long)s.icmp_packets);
    CHECK(s.tcp_packets  == 0, "tcp_packets=%llu", (unsigned long long)s.tcp_packets);
    CHECK(s.udp_packets  == 0, "udp_packets=%llu", (unsigned long long)s.udp_packets);
}

static void test_ipv4_other_proto(void)
{
    printf("test_ipv4_other_proto\n");
    /* GRE (47), and protocol 0 (HOPOPT) are not tcp/udp/icmp. */
    stats_reset();
    stats_record_ipv4(100, 47, 0);
    stats_record_ipv4(100, 0, 0);

    stats_snapshot_t s;
    stats_snapshot(&s);

    CHECK(s.other_packets == 2, "other_packets=%llu", (unsigned long long)s.other_packets);
    CHECK(s.ipv4_packets  == 2, "ipv4_packets=%llu", (unsigned long long)s.ipv4_packets);
    CHECK(s.tcp_packets   == 0, "tcp_packets=%llu", (unsigned long long)s.tcp_packets);
}

static void test_other_does_not_touch_ipv4(void)
{
    printf("test_other_does_not_touch_ipv4\n");
    stats_reset();
    stats_record_other(42);

    stats_snapshot_t s;
    stats_snapshot(&s);

    CHECK(s.total_packets    == 1,  "total_packets=%llu", (unsigned long long)s.total_packets);
    CHECK(s.total_bytes      == 42, "total_bytes=%llu",   (unsigned long long)s.total_bytes);
    CHECK(s.non_ipv4_packets == 1,  "non_ipv4=%llu",      (unsigned long long)s.non_ipv4_packets);
    CHECK(s.ipv4_packets     == 0,  "ipv4_packets=%llu",  (unsigned long long)s.ipv4_packets);
    CHECK(s.tcp_packets      == 0,  "tcp_packets=%llu",   (unsigned long long)s.tcp_packets);
    CHECK(s.udp_packets      == 0,  "udp_packets=%llu",   (unsigned long long)s.udp_packets);
    CHECK(s.icmp_packets     == 0,  "icmp_packets=%llu",  (unsigned long long)s.icmp_packets);
    CHECK(s.other_packets    == 0,  "other_packets=%llu", (unsigned long long)s.other_packets);
}

static void test_accumulation(void)
{
    printf("test_accumulation\n");
    stats_reset();
    for (int i = 0; i < 5; i++) {
        stats_record_ipv4(100, 6, 80);    /* 5 TCP, 500 bytes */
        stats_record_other(50);            /* 5 other, 250 bytes */
    }

    stats_snapshot_t s;
    stats_snapshot(&s);

    CHECK(s.total_packets == 10, "total_packets=%llu", (unsigned long long)s.total_packets);
    CHECK(s.total_bytes   == 750, "total_bytes=%llu", (unsigned long long)s.total_bytes);
    CHECK(s.tcp_packets   == 5,  "tcp_packets=%llu", (unsigned long long)s.tcp_packets);
    CHECK(s.ipv4_packets  == 5,  "ipv4_packets=%llu", (unsigned long long)s.ipv4_packets);
    CHECK(s.non_ipv4_packets == 5, "non_ipv4=%llu", (unsigned long long)s.non_ipv4_packets);
}

static void test_snapshot_is_copy(void)
{
    printf("test_snapshot_is_copy\n");
    stats_reset();
    stats_record_ipv4(100, 6, 80);

    stats_snapshot_t s1;
    stats_snapshot(&s1);
    stats_record_ipv4(100, 6, 80);   /* mutate after s1 */

    stats_snapshot_t s2;
    stats_snapshot(&s2);

    CHECK(s1.total_packets == 1, "s1 must be a frozen copy, got %llu",
          (unsigned long long)s1.total_packets);
    CHECK(s2.total_packets == 2, "s2 must reflect both records, got %llu",
          (unsigned long long)s2.total_packets);
}

static void test_reset(void)
{
    printf("test_reset\n");

    // Start from a clean slate so the pre-reset assertion below is
    // meaningful regardless of what previous tests did.
    stats_reset();
    stats_record_ipv4(100, 6, 80);

    stats_snapshot_t before;
    stats_snapshot(&before);
    CHECK(before.total_packets == 1, "pre-reset total_packets=%llu",
          (unsigned long long)before.total_packets);

    stats_reset();

    stats_snapshot_t after;
    stats_snapshot(&after);
    CHECK(after.total_packets == 0, "post-reset total_packets=%llu",
          (unsigned long long)after.total_packets);
    CHECK(after.total_bytes   == 0, "post-reset total_bytes=%llu",
          (unsigned long long)after.total_bytes);
    CHECK(after.tcp_packets   == 0, "post-reset tcp_packets=%llu",
          (unsigned long long)after.tcp_packets);
}

int main(void)
{
    test_ipv4_tcp();
    test_ipv4_udp();
    test_ipv4_icmp();
    test_ipv4_other_proto();
    test_other_does_not_touch_ipv4();
    test_accumulation();
    test_snapshot_is_copy();
    test_reset();

    printf("\n%d checks, %d failures\n", g_checks, g_failures);
    return g_failures == 0 ? 0 : 1;
}