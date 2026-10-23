import { describe, it, expect, afterEach, vi } from 'vitest';

// buildWsUrl reads import.meta.env.VITE_API_TOKEN and location.protocol/host.
// In jsdom, location.host is 'localhost:3000' by default and protocol is
// 'http:' — the test asserts the wss:// path by overriding location.
//
// We import the module inside each test after setting env because
// import.meta.env is read at module load time, not call time. Using
// vi.resetModules() forces a re-evaluation.

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('buildWsUrl', () => {
    it('uses ws:// on http pages', async () => {
        vi.stubEnv('VITE_API_TOKEN', 'test-token');
        vi.resetModules();
        const { buildWsUrl } = await import('./client');
        expect(buildWsUrl()).toBe('ws://localhost:3000/ws?token=test-token');
    });

    it('uses wss:// on https pages', async () => {
        vi.stubEnv('VITE_API_TOKEN', 'test-token');
        // jsdom does not allow mutating location.protocol directly. Override
        // the whole location object on window.
        const original = window.location;
        Object.defineProperty(window, 'location', {
            writable: true,
            value: { ...original, protocol: 'https:', host: 'example.com' },
        });

        vi.resetModules();
        const { buildWsUrl } = await import('./client');
        expect(buildWsUrl()).toBe('wss://example.com/ws?token=test-token');

        Object.defineProperty(window, 'location', { writable: true, value: original });
    });

    it('omits the token param when VITE_API_TOKEN is unset', async () => {
        vi.stubEnv('VITE_API_TOKEN', '');
        vi.resetModules();
        const { buildWsUrl } = await import('./client');
        expect(buildWsUrl()).toBe('ws://localhost:3000/ws');
    });
});