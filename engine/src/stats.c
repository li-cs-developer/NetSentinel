#include "stats.h"

#include <pthread.h>
#include <string.h>

static stats_snapshot_t g_stats;
static pthread_mutex_t   g_stats_lock = PTHREAD_MUTEX_INITIALIZER;

void stats_record_ipv4(uint32_t caplen, uint8_t proto, uint16_t dst_port)
{
    (void)dst_port; /* unused for now; will feed top-ports later */
    pthread_mutex_lock(&g_stats_lock);
    g_stats.total_packets++;
    g_stats.total_bytes += caplen;
    g_stats.ipv4_packets++;

    switch (proto) {
        case 6:  g_stats.tcp_packets++;  break;  /* IPPROTO_TCP */
        case 17: g_stats.udp_packets++;  break;  /* IPPROTO_UDP */
        case 1:  g_stats.icmp_packets++; break;  /* IPPROTO_ICMP */
        default: g_stats.other_packets++; break;
    }
    pthread_mutex_unlock(&g_stats_lock);
}

void stats_record_other(uint32_t caplen)
{
    pthread_mutex_lock(&g_stats_lock);
    g_stats.total_packets++;
    g_stats.total_bytes += caplen;
    g_stats.non_ipv4_packets++;
    pthread_mutex_unlock(&g_stats_lock);
}

void stats_snapshot(stats_snapshot_t *out)
{
    pthread_mutex_lock(&g_stats_lock);
    memcpy(out, &g_stats, sizeof(*out));
    pthread_mutex_unlock(&g_stats_lock);
}

void stats_reset(void)
{
    pthread_mutex_lock(&g_stats_lock);
    memset(&g_stats, 0, sizeof(g_stats));
    pthread_mutex_unlock(&g_stats_lock);
}