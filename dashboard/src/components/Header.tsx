import type { ConnectionState } from '../hooks/useStats.js';
import { ConnectionBadge } from './ConnectionBadge.js';
import { ThemeToggle } from './ThemeToggle.js';

interface Props {
    connection: ConnectionState;
    uptimeS: number;
    captureRunning: boolean;
}

export function Header({ connection, uptimeS, captureRunning }: Props) {
    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div
                    style={{
                        width: 32, height: 32, borderRadius: 'var(--radius-md)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden',
                        background: 'transparent',
                    }}
                >
                    <img
                        src="/net-sentinel-logo.png"
                        alt="NetSentinel logo"
                        width={32}
                        height={32}
                        style={{ objectFit: 'contain' }}
                    />
                </div>
                <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>NetSentinel</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {captureRunning ? 'Capturing' : 'Idle'} · up {formatUptime(uptimeS)}
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <ConnectionBadge state={connection} />
                <ThemeToggle />
            </div>
        </header>
    );
}

function formatUptime(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}