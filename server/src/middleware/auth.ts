import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * Constant-time string comparison. Prevents timing side-channels where
 * an attacker can brute-force a token one character at a time by
 * measuring response latency.
 */
function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}

export function requireToken(req: Request, res: Response, next: NextFunction): void {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/.exec(header);

    if (!match || !safeEqual(match[1]!, config.apiToken)) {
        res.status(401).json({ error: 'unauthorized' });
        return;
    }
    next();
}

/**
 * WebSocket auth is done at upgrade time. We accept the token in the
 * query string because browsers cannot set custom headers on the
 * WebSocket handshake. Return true if authorized.
 */
export function isWsAuthorized(url: string | undefined): boolean {
    if (!url) return false;
    const parsed = new URL(url, 'http://x');
    const token = parsed.searchParams.get('token');
    if (!token) return false;
    return safeEqual(token, config.apiToken);
}