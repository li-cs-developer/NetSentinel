import { Router } from 'express';
import type { CaptureAddon } from '../capture.js';

export function healthRouter(addon: CaptureAddon): Router {
    const router = Router();

    router.get('/', (_req, res) => {
        res.json({
            status: 'ok',
            uptime_s: Math.round(process.uptime()),
            capture_running: addon.isRunning(),
            node_version: process.version,
        });
    });

    return router;
}