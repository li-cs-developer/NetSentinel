import type { Request, Response, NextFunction } from 'express';

/**
 * Minimal CSP + security headers. No helmet dependency — keeps the
 * supply chain small and the headers explicit, which is what you'll
 * want to explain to an interviewer.
 *
 * CSP allows 'unsafe-inline' for styles during development because
 * Vite injects inline <style> tags. In production behind a static
 * build, tighten this to your hashed asset domain.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader(
        'Content-Security-Policy',
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "connect-src 'self' ws: wss:",
            "frame-ancestors 'none'",
        ].join('; '),
    );
    next();
}