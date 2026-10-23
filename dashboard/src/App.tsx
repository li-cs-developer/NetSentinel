import { useMemo, useState, useCallback } from 'react';
import { useStats } from './hooks/useStats.js';
import { useHealth } from './hooks/useHealth.js';
import { Header } from './components/Header.js';
import { StatTile } from './components/StatTile.js';
import { LiveChart } from './components/LiveChart.js';
import { CaptureControls } from './components/CaptureControls.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import './styles/globals.css';

function fmtNumber(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return n.toString();
}

function fmtBytes(b: number): string {
    if (b >= 1_073_741_824) return (b / 1_073_741_824).toFixed(2) + ' GiB';
    if (b >= 1_048_576) return (b / 1_048_576).toFixed(1) + ' MiB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KiB';
    return b + ' B';
}

export function App() {
    const { points, latest, connection, error: wsError } = useStats();
    const { health, refresh } = useHealth();
    const [iface, setIface] = useState('');

    const handleRefresh = useCallback(() => { void refresh(); }, [refresh]);

    const tiles = useMemo(() => [
        { label: 'Total packets', value: fmtNumber(latest?.total_packets ?? 0) },
        { label: 'Total bytes',   value: fmtBytes(latest?.total_bytes ?? 0) },
        { label: 'Packets / sec', value: (latest?.pps ?? 0).toFixed(0) },
        { label: 'Throughput',    value: fmtBytes(latest?.bps ?? 0) + '/s' },
        { label: 'TCP',  value: fmtNumber(latest?.tcp_packets  ?? 0), accent: 'var(--data-tcp)' },
        { label: 'UDP',  value: fmtNumber(latest?.udp_packets  ?? 0), accent: 'var(--data-udp)' },
        { label: 'ICMP', value: fmtNumber(latest?.icmp_packets ?? 0), accent: 'var(--data-icmp)' },
        { label: 'Other', value: fmtNumber(latest?.other_packets ?? 0), accent: 'var(--data-other)' },
    ], [latest]);

    return (
        <main className="app">
            <Header
                connection={connection}
                uptimeS={health?.uptime_s ?? 0}
                captureRunning={health?.capture_running ?? false}
            />

            {wsError && <ErrorBanner message={`Live feed: ${wsError}`} />}

            <CaptureControls
                running={health?.capture_running ?? false}
                onChanged={handleRefresh}
                iface={iface}
                onIfaceChange={setIface}
            />

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 'var(--space-3)',
                }}
            >
                {tiles.map((t) => (
                    <StatTile key={t.label} label={t.label} value={t.value} accent={t.accent} />
                ))}
            </div>

            <LiveChart data={points} />
        </main>
    );
}