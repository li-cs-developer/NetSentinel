export interface StatsSnapshot {
    total_packets: number;
    total_bytes: number;
    tcp_packets: number;
    udp_packets: number;
    icmp_packets: number;
    other_packets: number;
    ipv4_packets: number;
    non_ipv4_packets: number;
}

export interface HealthResponse {
    status: 'ok';
    uptime_s: number;
    capture_running: boolean;
    node_version: string;
}

/**
 * Shape of a broadcast payload. pps/bps are computed server-side;
 * t is the server's Date.now() at broadcast time.
 */
export interface StatsPoint extends StatsSnapshot {
    pps: number;
    bps: number;
    t: number;
}

export type WsMessage =
    | { type: 'snapshot'; data: StatsPoint }
    | { type: 'error'; message: string };