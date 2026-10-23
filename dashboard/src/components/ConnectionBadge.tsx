import type { ConnectionState } from '../hooks/useStats.js';

const LABELS: Record<ConnectionState, string> = {
    connecting:   'Connecting',
    open:         'Live',
    reconnecting: 'Reconnecting',
    closed:       'Disconnected',
};

const COLORS: Record<ConnectionState, string> = {
    connecting:   'var(--status-warn)',
    open:         'var(--status-ok)',
    reconnecting: 'var(--status-warn)',
    closed:       'var(--status-error)',
};

export function ConnectionBadge({ state }: { state: ConnectionState }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                fontSize: 12,
                fontWeight: 500,
            }}
            role="status"
            aria-live="polite"
        >
      <span
          style={{
              width: 8, height: 8, borderRadius: '50%',
              background: COLORS[state],
              boxShadow: state === 'open'
                  ? '0 0 8px var(--status-ok)'
                  : 'none',
              transition: 'box-shadow 200ms ease',
          }}
      />
            {LABELS[state]}
    </span>
    );
}