import { resolve } from 'node:path';

function readInt(name: string, fallback: number, min: number, max: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function readString(name: string, fallback: string): string {
    return process.env[name] ?? fallback;
}

// import.meta.dirname points at server/dist/ at runtime (the compiled
// module). Two levels up is the repo root:
//   /<repo>/server/dist  →  ..  →  /<repo>/server  →  ..  →  /<repo>
// Exported so index.ts can build paths to dashboard/dist and the addon
// without recomputing them.
export const repoRoot = resolve(import.meta.dirname, '..', '..');

export const config = {
    port: readInt('PORT', 3000, 1, 65535),
    host: readString('HOST', '0.0.0.0'),
    captureInterface: readString('CAPTURE_INTERFACE', ''),
    autoStart: readString('AUTO_START', '0') === '1',
    statsIntervalMs: readInt('STATS_INTERVAL_MS', 500, 100, 10_000),
    wsPath: readString('WS_PATH', '/ws'),
    apiToken: readString('API_TOKEN', ''),

    addonPath: resolve(repoRoot, 'build', 'Release', 'netsentinel_addon.node'),
} as const;

export type Config = typeof config;