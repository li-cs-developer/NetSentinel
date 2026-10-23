import { useCallback, useState } from 'react';
import { api } from '../api/client.js';

export function useCaptureControl(onChanged?: () => void) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const start = useCallback(async (iface?: string) => {
        setBusy(true);
        setError(null);
        try {
            await api.startCapture(iface);
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }, [onChanged]);

    const stop = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await api.stopCapture();
            onChanged?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }, [onChanged]);

    return { start, stop, busy, error };
}