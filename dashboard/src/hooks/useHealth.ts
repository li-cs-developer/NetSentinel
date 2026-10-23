import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { HealthResponse } from '../api/types.js';

export function useHealth(pollMs = 5_000) {
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            try {
                const h = await api.health();
                if (!cancelled) { setHealth(h); setError(null); }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            }
        };
        void tick();
        const id = setInterval(tick, pollMs);
        return () => { cancelled = true; clearInterval(id); };
    }, [pollMs]);

    return { health, error, refresh: async () => {
            try { setHealth(await api.health()); setError(null); }
            catch (err) { setError(err instanceof Error ? err.message : String(err)); }
        }};
}