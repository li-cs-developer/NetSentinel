import type { HealthResponse, StatsSnapshot } from './types.js';

const TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined;

function authHeaders(): HeadersInit {
    return TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
}

async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
            ...init.headers,
        },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
}

export const api = {
    health: () => jsonFetch<HealthResponse>('/api/health'),
    stats: () => jsonFetch<StatsSnapshot>('/api/stats'),
    startCapture: (iface?: string) =>
        jsonFetch<{ interface: string }>('/api/stats/capture/start', {
            method: 'POST',
            body: JSON.stringify({ interface: iface ?? '' }),
        }),
    stopCapture: () =>
        jsonFetch<void>('/api/stats/capture/stop', { method: 'POST' }),
};

/**
 * Build the WebSocket URL from the current page origin. This works
 * both for Vite dev (proxied to :3000) and for production (same
 * origin as the page).
 */
export function buildWsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenParam = TOKEN ? `?token=${encodeURIComponent(TOKEN)}` : '';
    return `${proto}//${location.host}/ws${tokenParam}`;
}