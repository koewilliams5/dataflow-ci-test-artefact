"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailySeriesPoint } from "../../../lib/dashboard/buildDailyStatusSeries";

const STATUS_COLORS: Record<keyof Omit<DailySeriesPoint, "date">, string> = {
  SUCCESS: "#067647",
  PARTIAL: "#b54708",
  FAILED: "#b42318",
  PENDING: "#98a2b3",
  PROCESSING: "#2563eb",
};

const STATUS_LABELS: Record<keyof Omit<DailySeriesPoint, "date">, string> = {
  SUCCESS: "Succès",
  PARTIAL: "Partiel",
  FAILED: "Échec",
  PENDING: "En attente",
  PROCESSING: "En cours",
};

const STATUS_KEYS = Object.keys(STATUS_COLORS) as (keyof Omit<DailySeriesPoint, "date">)[];

/** Barres empilées par jour et par statut — vue "volume traité dans le temps". */
export function DailyIngestionsChart({ data }: { data: DailySeriesPoint[] }) {
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          {STATUS_KEYS.map((status) => (
            <Bar
              key={status}
              dataKey={status}
              stackId="status"
              fill={STATUS_COLORS[status]}
              name={STATUS_LABELS[status]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
