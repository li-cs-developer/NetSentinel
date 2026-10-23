import { Router, type Request, type Response } from 'express';
import type { CaptureAddon } from '../capture.js';
import { config } from '../config.js';

export function statsRouter(addon: CaptureAddon): Router {
    const router = Router();

    router.get('/', (_req: Request, res: Response) => {
        res.json(addon.getStats());
    });

    router.post('/capture/start', async (req: Request, res: Response) => {
        if (addon.isRunning()) {
            res.status(409).json({ error: 'capture already running' });
            return;
        }
        const iface =
            typeof req.body?.interface === 'string' && req.body.interface.length > 0
                ? req.body.interface
                : config.captureInterface || null;

        try {
            const name = await addon.startCapture(iface);
            res.status(201).json({ interface: name });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    router.post('/capture/stop', async (_req: Request, res: Response) => {
        if (!addon.isRunning()) {
            res.status(409).json({ error: 'capture not running' });
            return;
        }
        try {
            await addon.stopCapture();
            res.status(204).end();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            res.status(500).json({ error: msg });
        }
    });

    return router;
}