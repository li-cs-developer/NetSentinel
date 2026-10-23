import { useCaptureControl } from '../hooks/useCaptureControl.js';

interface Props {
    running: boolean;
    onChanged: () => void;
    iface: string;
    onIfaceChange: (v: string) => void;
}

export function CaptureControls({ running, onChanged, iface, onIfaceChange }: Props) {
    const { start, stop, busy, error } = useCaptureControl(onChanged);

    return (
        <div
            style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'center',
                flexWrap: 'wrap',
            }}
        >
            <input
                type="text"
                value={iface}
                onChange={(e) => onIfaceChange(e.target.value)}
                placeholder="interface (e.g. eth0)"
                disabled={running || busy}
                style={{
                    padding: 'var(--space-2) var(--space-3)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    width: 200,
                }}
            />
            {running ? (
                <button className="danger" onClick={() => void stop()} disabled={busy}>
                    Stop capture
                </button>
            ) : (
                <button className="primary" onClick={() => void start(iface || undefined)} disabled={busy}>
                    Start capture
                </button>
            )}
            {error && (
                <span style={{ color: 'var(--status-error)', fontSize: 12 }}>{error}</span>
            )}
        </div>
    );
}