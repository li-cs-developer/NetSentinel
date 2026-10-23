#ifndef UTIL_H
#define UTIL_H

/* Detect the primary non-loopback interface name (e.g. "eth0", "wlan0").
 * Writes into `out` (size >= IFNAMSIZ). Returns 0 on success, -1 on failure. */
int detect_default_interface(char *out, unsigned int out_len);

#endif