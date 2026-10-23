import { useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
} from 'recharts';
import type { StatsPoint } from '../api/types.js';

interface Props {
    data: StatsPoint[];
}

const WINDOW_MS = 60_000;

export function LiveChart({ data }: Props) {
    const chartData = useMemo(() => {
        if (data.length === 0) return [];
        // Only the last 60 s of points, so a backgrounded tab that comes
        // back doesn't stretch the axis across minutes of accumulated data.
        const cutoff = data[data.length - 1]!.t - WINDOW_MS;
        return data
            .filter((p) => p.t >= cutoff)
            .map((p) => ({
                t: p.t,
                tcp: p.tcp_packets,
                udp: p.udp_packets,
                icmp: p.icmp_packets,
                other: p.other_packets,
            }));
    }, [data]);

    const tMin = chartData.length > 0 ? chartData[0]!.t : 0;
    const tMax = chartData.length > 0 ? chartData[chartData.length - 1]!.t : 1;

    return (
        <div
            style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                boxShadow: 'var(--shadow-card)',
            }}
        >
            <h2
                style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 'var(--space-3)',
                }}
            >
                Protocol breakdown — last 60 s
            </h2>
            <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                        <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="2 4" vertical={false} />
                        <XAxis
                            dataKey="t"
                            type="number"
                            domain={[tMin, tMax]}
                            tickFormatter={(v: number) =>
                                new Date(v).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}
                            stroke="var(--text-muted)"
                            style={{ fontSize: 11 }}
                        />
                        <YAxis stroke="var(--text-muted)" style={{ fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-strong)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: 12,
                            }}
                            labelFormatter={(v: number) => new Date(v).toLocaleTimeString()}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="tcp"   name="TCP"   stroke="var(--data-tcp)"   dot={false} strokeWidth={2} isAnimationActive={false} />
                        <Line type="monotone" dataKey="udp"   name="UDP"   stroke="var(--data-udp)"   dot={false} strokeWidth={2} isAnimationActive={false} />
                        <Line type="monotone" dataKey="icmp"  name="ICMP"  stroke="var(--data-icmp)"  dot={false} strokeWidth={2} isAnimationActive={false} />
                        <Line type="monotone" dataKey="other" name="Other" stroke="var(--data-other)" dot={false} strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}