"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TopSourceDatum {
  id: string;
  name: string;
  ingestionCount: number;
  successCount: number;
}

/** Sources les plus actives sur la période — vue "où se concentre le volume". */
export function TopSourcesChart({ data }: { data: TopSourceDatum[] }) {
  return (
    <div style={{ width: "100%", height: Math.max(200, data.length * 50) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={160}
            tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip cursor={{ fill: "var(--chart-cursor)" }} />
          <Bar dataKey="ingestionCount" name="Ingestions" fill="var(--chart-accent)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
