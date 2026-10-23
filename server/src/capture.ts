import { createRequire } from 'node:module';
import { config } from './config.js';

/**
 * Shape of a stats snapshot emitted by the native addon.
 * Keep in sync with addon/src/bridge.cpp (getStats()/snapshot object).
 */
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

export interface CaptureAddon {
    startCapture(iface?: string | null): Promise<string>;
    stopCapture(): Promise<void>;
    getStats(): StatsSnapshot;
    isRunning(): boolean;
}

const require = createRequire(import.meta.url);

/**
 * The addon is a .node binary, not a JS module. TS module resolution
 * does not understand it, so we require() and cast. The two-step cast
 * (unknown → CaptureAddon) prevents a silent shape mismatch: if the
 * native module exports something that doesn't match the interface, TS
 * will still accept the cast, but the runtime error will be loud and
 * traceable to this line.
 */
const addon = require(config.addonPath) as unknown as CaptureAddon;

export function loadAddon(): CaptureAddon {
    return addon;
}