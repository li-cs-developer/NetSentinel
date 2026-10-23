#include "capture.h"
#include "parser.h"
#include "stats.h"
#include "util.h"

#include <arpa/inet.h>
#include <errno.h>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <net/if.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#define SNAP_LEN 65536

struct capture_ctx {
    char          iface[IFNAMSIZ];
    int           sock;
    int           ifindex;
    packet_cb_t   cb;
    void         *user;

    pthread_t     thread;
    volatile int  running;
    int           thread_started;
};

static int set_promisc(int sock, int ifindex, int enable, const char *iface)
{
    struct packet_mreq mr;
    memset(&mr, 0, sizeof(mr));
    mr.mr_ifindex = ifindex;
    mr.mr_type    = PACKET_MR_PROMISC;

    int opt = enable ? PACKET_ADD_MEMBERSHIP : PACKET_DROP_MEMBERSHIP;
    if (setsockopt(sock, SOL_PACKET, opt, &mr, sizeof(mr)) < 0) {
        if (enable) {
            /* Non-fatal: many virtual interfaces don't support promisc. */
            fprintf(stderr,
                    "[capture] warning: promiscuous mode not supported on %s (%s)\n",
                    iface, strerror(errno));
        }
        return -1;
    }
    return 0;
}

static void *capture_loop(void *arg)
{
    capture_ctx_t *ctx = (capture_ctx_t *)arg;
    uint8_t *buf = malloc(SNAP_LEN);
    if (!buf) {
        perror("[capture] malloc");
        return NULL;
    }

    struct sockaddr_ll  sll;
    socklen_t           sll_len = sizeof(sll);

    while (ctx->running) {
        ssize_t n = recvfrom(ctx->sock, buf, SNAP_LEN, 0,
                             (struct sockaddr *)&sll, &sll_len);
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                continue; /* timeout, re-check running flag */
            }
            if (errno == EINTR) continue;
            perror("[capture] recvfrom");
            break;
        }

        if (ctx->cb) {
            ctx->cb(buf, (uint32_t)n, ctx->user);
        }
    }

    free(buf);
    return NULL;
}

capture_ctx_t *capture_create(const char *iface, packet_cb_t cb, void *user)
{
    capture_ctx_t *ctx = calloc(1, sizeof(*ctx));
    if (!ctx) return NULL;

    ctx->sock = -1;
    ctx->cb = cb;
    ctx->user = user;

    if (iface) {
        strncpy(ctx->iface, iface, sizeof(ctx->iface) - 1);
    } else {
        if (detect_default_interface(ctx->iface, sizeof(ctx->iface)) != 0) {
            fprintf(stderr, "[capture] no suitable interface detected; "
                            "specify one explicitly with -i\n");
            free(ctx);
            return NULL;
        }
    }

    ctx->ifindex = (int)if_nametoindex(ctx->iface);
    if (ctx->ifindex == 0) {
        fprintf(stderr, "[capture] interface '%s' not found\n", ctx->iface);
        free(ctx);
        return NULL;
    }

    /* SOCK_RAW keeps the Ethernet header; ETH_P_ALL = every protocol. */
    ctx->sock = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));
    if (ctx->sock < 0) {
        perror("[capture] socket(AF_PACKET, SOCK_RAW) — try sudo");
        free(ctx);
        return NULL;
    }

    struct sockaddr_ll addr;
    memset(&addr, 0, sizeof(addr));
    addr.sll_family   = AF_PACKET;
    addr.sll_protocol = htons(ETH_P_ALL);
    addr.sll_ifindex  = ctx->ifindex;

    if (bind(ctx->sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("[capture] bind");
        close(ctx->sock);
        free(ctx);
        return NULL;
    }

    (void)set_promisc(ctx->sock, ctx->ifindex, 1, ctx->iface);

    /* 250 ms recv timeout so the loop can observe `running` */
    struct timeval tv = { .tv_sec = 0, .tv_usec = 250000 };
    setsockopt(ctx->sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    int rcvbuf = 4 * 1024 * 1024;
    setsockopt(ctx->sock, SOL_SOCKET, SO_RCVBUF, &rcvbuf, sizeof(rcvbuf));

    return ctx;
}

int capture_start(capture_ctx_t *ctx)
{
    if (!ctx || ctx->thread_started) return -1;
    ctx->running = 1;
    if (pthread_create(&ctx->thread, NULL, capture_loop, ctx) != 0) {
        ctx->running = 0;
        return -1;
    }
    ctx->thread_started = 1;
    return 0;
}

void capture_stop(capture_ctx_t *ctx)
{
    if (!ctx || !ctx->thread_started) return;
    ctx->running = 0;
    pthread_join(ctx->thread, NULL);
    ctx->thread_started = 0;
}

void capture_destroy(capture_ctx_t *ctx)
{
    if (!ctx) return;
    capture_stop(ctx);
    if (ctx->sock >= 0) {
        (void)set_promisc(ctx->sock, ctx->ifindex, 0, ctx->iface);
        close(ctx->sock);
    }
    free(ctx);
}

const char *capture_iface(const capture_ctx_t *ctx)
{
    return ctx ? ctx->iface : "";
}