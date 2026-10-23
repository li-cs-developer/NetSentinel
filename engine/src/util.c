#include "util.h"

#include <stdio.h>
#include <string.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <sys/socket.h>
#include <netinet/in.h>

int detect_default_interface(char *out, unsigned int out_len)
{
    struct ifaddrs *ifaddr = NULL, *ifa = NULL;
    int found = -1;

    if (getifaddrs(&ifaddr) == -1) {
        perror("getifaddrs");
        return -1;
    }

    /* Prefer the first interface that:
     *   - is up
     *   - is not loopback
     *   - has an IPv4 address
     */
    for (ifa = ifaddr; ifa != NULL; ifa = ifa->ifa_next) {
        if (!ifa->ifa_addr) continue;
        if (ifa->ifa_addr->sa_family != AF_INET) continue;
        if (!(ifa->ifa_flags & IFF_UP)) continue;
        if (ifa->ifa_flags & IFF_LOOPBACK) continue;

        strncpy(out, ifa->ifa_name, out_len - 1);
        out[out_len - 1] = '\0';
        found = 0;
        break;
    }

    freeifaddrs(ifaddr);
    return found;
}