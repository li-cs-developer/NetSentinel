#ifndef CAPTURE_H
#define CAPTURE_H

#include <stdint.h>

typedef void (*packet_cb_t)(const uint8_t *buf, uint32_t caplen, void *user);

typedef struct capture_ctx capture_ctx_t;

/* Create a capture context. iface may be NULL to auto-detect. */
capture_ctx_t *capture_create(const char *iface, packet_cb_t cb, void *user);

/* Start capture thread. Returns 0 on success, -1 on error (errno set). */
int capture_start(capture_ctx_t *ctx);

/* Stop capture thread and join. Safe to call twice. */
void capture_stop(capture_ctx_t *ctx);

/* Destroy context (must have been stopped first). */
void capture_destroy(capture_ctx_t *ctx);

/* Interface actually used. */
const char *capture_iface(const capture_ctx_t *ctx);

#endif