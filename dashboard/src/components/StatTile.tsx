import type { ReactNode } from 'react';

interface Props {
    label: string;
    value: ReactNode;
    hint?: string;
    accent?: string;
}

export function StatTile({ label, value, hint, accent }: Props) {
    return (
        <div
            style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                minHeight: 88,
            }}
        >
            <div
                style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                }}
            >
                {label}
            </div>
            <div
                className="mono"
                style={{
                    fontSize: 26,
                    fontWeight: 600,
                    color: accent ?? 'var(--text-primary)',
                    lineHeight: 1.1,
                }}
            >
                {value}
            </div>
            {hint && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hint}</div>
            )}
        </div>
    );
}