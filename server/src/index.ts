import http from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { config, repoRoot } from './config.js';
import { loadAddon, type CaptureAddon } from './capture.js';
import { healthRouter } from './routes/health.js';
import { statsRouter } from './routes/stats.js';
import { requireToken } from './middleware/auth.js';
import { securityHeaders } from './middleware/security.js';
import { StatsBroadcaster } from './ws/broadcaster.js';

async function main(): Promise<void> {
    // ── Preflight: addon must exist before we touch the port ─
    if (!existsSync(config.addonPath)) {
        console.error(
            `[server] native addon not found at:\n  ${config.addonPath}\n\n` +
            `  Run from the repo root first:\n` +
            `    npx node-gyp rebuild\n\n` +
            `  Then re-run the server.`,
        );
        process.exit(1);
    }

    if (!config.apiToken) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[server] API_TOKEN must be set in production');
            process.exit(1);
        }
        console.warn('[server] API_TOKEN not set — auth disabled (dev mode)');
    }

    // ── Static serving of the built dashboard ────────────────
    // If dashboard/dist/index.html exists, the server doubles as
    // the dashboard host. This is how Phase 5 ships: one process,
    // one port, one URL. If the dashboard hasn't been built yet
    // (developer hasn't run `npm run build` in dashboard/), we
    // fall back to API-only mode so the server still starts.
    const dashboardDist = join(repoRoot, 'dashboard', 'dist');
    const serveDashboard = existsSync(join(dashboardDist, 'index.html'));

    const addon: CaptureAddon = loadAddon();

    const app = express();
    app.use(express.json({ limit: '64kb' }));
    app.use(securityHeaders);

    if (process.env.NODE_ENV !== 'production') {
        app.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (req.method === 'OPTIONS') { res.status(204).end(); return; }
            next();
        });
    }

    app.use((req, _res, next) => {
        console.log(`[http] ${req.method} ${req.path}`);
        next();
    });

    app.use('/api/health', healthRouter(addon));
    app.use('/api/stats', requireToken, statsRouter(addon));

    // ── Static + SPA fallback ────────────────────────────────
    // Must come AFTER the API routes so /api/* is handled by the
    // routers above, and BEFORE the error handler so real errors
    // still reach it.
    if (serveDashboard) {
        // Try to serve a real file first (assets, favicon, etc.).
        app.use(express.static(dashboardDist, {
            index: 'index.html',
            maxAge: '1h',
        }));

        // Any GET that isn't /api/* or /ws/* and didn't match a
        // static file is a client-side route. Serve index.html so
        // the SPA router can handle it. The negative lookahead is
        // load-bearing: without it, /api/does-not-exist would return
        // the SPA HTML with a 200, and the "404 for unknown API
        // routes" test in test_http.js would silently pass against
        // a broken endpoint.
        app.get(/^\/(?!api\/|ws\/).*/, (_req, res) => {
            res.sendFile(join(dashboardDist, 'index.html'));
        });

        console.log(`[static] serving dashboard from ${dashboardDist}`);
    } else {
        console.log('[static] dashboard dist/ not found — API only');
    }

    app.use(
        (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
            console.error('[http] unhandled error:', err);
            res.status(500).json({ error: 'internal error' });
        },
    );

    const server = http.createServer(app);
    const broadcaster = new StatsBroadcaster(server, addon);

    if (config.captureInterface || config.autoStart) {
        try {
            const iface = await addon.startCapture(config.captureInterface || null);
            console.log(`[capture] auto-started on ${iface}`);
        } catch (err) {
            console.error('[capture] auto-start failed:', err);
        }
    } else {
        console.log('[capture] not started — POST /api/stats/capture/start or set AUTO_START=1');
    }

    server.listen(config.port, config.host, () => {
        console.log(`[http] listening on http://${config.host}:${config.port}`);
        console.log(`[ws]   listening at ws://${config.host}:${config.port}${config.wsPath}`);
        broadcaster.start();
    });

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[server] ${signal} received — shutting down`);

        try { await broadcaster.stop(); } catch (err) { console.error('[server] ws stop:', err); }
        try {
            if (addon.isRunning()) await addon.stopCapture();
        } catch (err) { console.error('[server] capture stop:', err); }

        server.close(() => {
            console.log('[server] bye');
            process.exit(0);
        });

        setTimeout(() => {
            console.error('[server] forced exit after timeout');
            process.exit(1);
        }, 5_000).unref();
    };

    process.on('SIGINT',  () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
    process.on('unhandledRejection', (reason) => {
        console.error('[server] unhandledRejection:', reason);
    });
}

main().catch((err) => {
    console.error('[server] fatal:', err);
    process.exit(1);
});