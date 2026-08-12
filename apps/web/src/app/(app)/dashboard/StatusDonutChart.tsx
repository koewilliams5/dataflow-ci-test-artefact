"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface StatusDonutChartProps {
  success: number;
  partial: number;
  failed: number;
  inProgress: number;
}

const SLICES: { key: keyof StatusDonutChartProps; label: string; color: string }[] = [
  { key: "success", label: "Succès", color: "var(--chart-success)" },
  { key: "partial", label: "Partiel", color: "var(--chart-partial)" },
  { key: "failed", label: "Échec", color: "var(--chart-failed)" },
  { key: "inProgress", label: "En cours", color: "var(--chart-processing)" },
];

/** Répartition des statuts sur la période — vue "santé globale" en un coup d'œil. */
export function StatusDonutChart(props: StatusDonutChartProps) {
  const data = SLICES.map((slice) => ({
    name: slice.label,
    value: props[slice.key],
    color: slice.color,
  })).filter((entry) => entry.value > 0);

  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (data.length === 0) {
    return (
      <div className="empty-state-chart">
        <span className="empty-state-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
          </svg>
        </span>
        <p className="empty-state-text">Aucune donnée sur cette période.</p>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 260, position: "relative" }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke="var(--bg-surface)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <div className="donut-center-value">{total}</div>
        <div className="donut-center-label">ingestions</div>
      </div>
    </div>
  );
}
