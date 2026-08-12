"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface StatusDonutChartProps {
  success: number;
  partial: number;
  failed: number;
  inProgress: number;
}

const SLICES: { key: keyof StatusDonutChartProps; label: string; color: string }[] = [
  { key: "success", label: "Succès", color: "#067647" },
  { key: "partial", label: "Partiel", color: "#b54708" },
  { key: "failed", label: "Échec", color: "#b42318" },
  { key: "inProgress", label: "En cours", color: "#2563eb" },
];

/** Répartition des statuts sur la période — vue "santé globale" en un coup d'œil. */
export function StatusDonutChart(props: StatusDonutChartProps) {
  const data = SLICES.map((slice) => ({
    name: slice.label,
    value: props[slice.key],
    color: slice.color,
  })).filter((entry) => entry.value > 0);

  if (data.length === 0) {
    return <p className="empty-state">Aucune donnée sur cette période.</p>;
  }

  return (
    <div style={{ width: "100%", height: 260 }}>
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
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
