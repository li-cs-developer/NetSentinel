# Firewall reference

This directory contains reference rulesets, not installer scripts. Copy
`nftables.conf` to `/etc/nftables.conf` on a host where NetSentinel will
run, review the interface names and port numbers, then `sudo nft -f`.

## Why NetSentinel sees packets the firewall drops

`AF_PACKET` sockets attach at the **link layer** (`dev_queue_xmit_skb`
on the TX path, `netif_receive_skb` on the RX path). `netfilter`
(`iptables`/`nftables`) runs **above** the link layer. Consequence:

- NetSentinel sees **every** frame the NIC delivers — including ones
  the firewall will later drop.
- `nftables` counters tell you *that* a packet was dropped, not
  *what* the attacker sent.
- Together: NetSentinel shows the *content* of failed probes, `nft`
  shows the *volume* of blocked traffic. Complementary, not overlapping.

## Reading the two together

If NetSentinel shows a spike in `tcp_packets` toward port 23 (telnet)
but `nft list counters` shows the same spike on the drop counter for
port 23, you know:

1. Someone is scanning.
2. The firewall is doing its job.
3. The scanner is not getting anything back (DROP, not REJECT), so
   they won't learn the port is filtered either.