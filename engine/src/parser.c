#include "parser.h"

#include <string.h>
#include <arpa/inet.h>
#include <netinet/if_ether.h>   /* struct ethhdr */
#include <netinet/ip.h>          /* struct iphdr  */
#include <netinet/tcp.h>         /* struct tcphdr */
#include <netinet/udp.h>         /* struct udphdr */

int parse_ethernet_ipv4(const uint8_t *buf, size_t len, parsed_packet_t *out)
{
    if (len < sizeof(struct ethhdr) + sizeof(struct iphdr)) {
        return -1;
    }

    /* Copy into aligned locals — avoids unaligned dereference of the
     * 14-byte-shifted frame data. Compiles to a single mov on x86. */
    struct ethhdr eth;
    memcpy(&eth, buf, sizeof(eth));
    if (ntohs(eth.h_proto) != ETH_P_IP) {
        return -1;
    }

    struct iphdr ip;
    memcpy(&ip, buf + sizeof(struct ethhdr), sizeof(ip));

    /* Sanity: IHL must be >= 5 and fit in captured buffer */
    if (ip.version != 4) return -1;
    unsigned int ihl_bytes = ip.ihl * 4u;
    if (ihl_bytes < sizeof(struct iphdr)) return -1;

    size_t l4_offset = sizeof(struct ethhdr) + ihl_bytes;
    if (len < l4_offset) return -1;

    memset(out, 0, sizeof(*out));
    out->ip_proto = ip.protocol;
    out->src_ip   = ip.saddr;
    out->dst_ip   = ip.daddr;

    if (ip.protocol == IPPROTO_TCP) {
        if (len < l4_offset + sizeof(struct tcphdr)) return -1;
        struct tcphdr tcp;
        memcpy(&tcp, buf + l4_offset, sizeof(tcp));
        out->src_port = ntohs(tcp.source);
        out->dst_port = ntohs(tcp.dest);
    } else if (ip.protocol == IPPROTO_UDP) {
        if (len < l4_offset + sizeof(struct udphdr)) return -1;
        struct udphdr udp;
        memcpy(&udp, buf + l4_offset, sizeof(udp));
        out->src_port = ntohs(udp.source);
        out->dst_port = ntohs(udp.dest);
    }

    return 0;
}