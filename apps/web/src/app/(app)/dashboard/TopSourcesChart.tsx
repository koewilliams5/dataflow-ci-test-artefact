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
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="ingestionCount" name="Ingestions" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
