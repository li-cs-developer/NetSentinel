#include "capture.h"
#include "parser.h"
#include "stats.h"
#include "util.h"

#include <arpa/inet.h>
#include <errno.h>
#include <getopt.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

static volatile sig_atomic_t g_stop = 0;

static void on_signal(int sig) { (void)sig; g_stop = 1; }

/* Callback invoked from capture thread for each packet. */
static void on_packet(const uint8_t *buf, uint32_t caplen, void *user)
{
    (void)user;
    parsed_packet_t pkt;
    if (parse_ethernet_ipv4(buf, caplen, &pkt) == 0) {
        stats_record_ipv4(caplen, pkt.ip_proto, pkt.dst_port);
    } else {
        stats_record_other(caplen);
    }
}

static double now_sec(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
}

/* Sleep for `ms` milliseconds, resuming after signal interruption. */
static void sleep_ms(long ms)
{
    struct timespec ts = {
        .tv_sec  = ms / 1000,
        .tv_nsec = (ms % 1000) * 1000000L,
    };
    while (nanosleep(&ts, &ts) == -1 && errno == EINTR) {
        /* remaining time stays in `ts`; loop re-checks g_stop */
    }
}

static void print_header(const char *iface)
{
    printf("\nNetSentinel engine — capturing on %s\n", iface);
    printf("%-8s | %10s %10s | %8s %8s %8s %8s | %10s %10s\n",
           "elapsed",
           "pkts", "bytes",
           "tcp", "udp", "icmp", "other",
           "pkts/s", "Mbps");
    printf("---------+----------------------"
           "+---------------------------"
           "+------------------\n");
}

int main(int argc, char **argv)
{
    const char *iface = NULL;
    int         interval_ms = 1000;

    int opt;
    while ((opt = getopt(argc, argv, "i:n:h")) != -1) {
        switch (opt) {
            case 'i': iface = optarg; break;
            case 'n': interval_ms = atoi(optarg); if (interval_ms < 100) interval_ms = 100; break;
            case 'h':
            default:
                fprintf(stderr,
                    "Usage: %s [-i iface] [-n interval_ms]\n"
                    "  -i iface        interface to capture on (default: auto)\n"
                    "  -n interval_ms  stats print interval, ms (default 1000)\n",
                    argv[0]);
                return opt == 'h' ? 0 : 1;
        }
    }

    signal(SIGINT,  on_signal);
    signal(SIGTERM, on_signal);

    capture_ctx_t *ctx = capture_create(iface, on_packet, NULL);
    if (!ctx) return 1;

    if (capture_start(ctx) != 0) {
        perror("capture_start");
        capture_destroy(ctx);
        return 1;
    }

    print_header(capture_iface(ctx));

    stats_snapshot_t prev = {0};
    double t0 = now_sec();
    double last_t = t0;

    while (!g_stop) {
        sleep_ms(interval_ms);
        if (g_stop) break;

        stats_snapshot_t cur;
        stats_snapshot(&cur);
        double t  = now_sec();
        double dt = t - last_t;
        if (dt <= 0) dt = interval_ms / 1000.0;

        uint64_t dpkts  = cur.total_packets - prev.total_packets;
        uint64_t dbytes = cur.total_bytes   - prev.total_bytes;
        double   pps    = (double)dpkts / dt;
        double   mbps   = ((double)dbytes * 8.0) / dt / 1e6;

        printf("%7.1fs | %10llu %10llu | %8llu %8llu %8llu %8llu | %10.0f %10.3f\n",
               t - t0,
               (unsigned long long)cur.total_packets,
               (unsigned long long)cur.total_bytes,
               (unsigned long long)cur.tcp_packets,
               (unsigned long long)cur.udp_packets,
               (unsigned long long)cur.icmp_packets,
               (unsigned long long)cur.other_packets,
               pps, mbps);

        prev = cur;
        last_t = t;
    }

    printf("\n[capture] stopping...\n");
    capture_destroy(ctx);

    stats_snapshot_t fin;
    stats_snapshot(&fin);
    printf("[capture] final: %llu packets, %llu bytes\n",
           (unsigned long long)fin.total_packets,
           (unsigned long long)fin.total_bytes);
    return 0;
}