export interface DailyStatusCountInput {
  day: Date;
  status: string;
  count: number;
}

export interface DailySeriesPoint {
  date: string;
  SUCCESS: number;
  PARTIAL: number;
  FAILED: number;
  PENDING: number;
  PROCESSING: number;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function truncateToDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

const STATUS_KEYS = ["SUCCESS", "PARTIAL", "FAILED", "PENDING", "PROCESSING"] as const;
type StatusKey = (typeof STATUS_KEYS)[number];

function isStatusKey(value: string): value is StatusKey {
  return (STATUS_KEYS as readonly string[]).includes(value);
}

/**
 * Transforme les lignes `(jour, statut, compte)` renvoyées par la requête SQL
 * en une série continue, un point par jour entre `since` et `until` inclus —
 * sans ce remplissage, un jour sans aucune ingestion serait simplement absent
 * du tableau plutôt que d'apparaître à 0, ce qui casserait l'axe des temps
 * d'un graphique Recharts (jours manquants, pas de "trous à zéro").
 */
export function buildDailyStatusSeries(
  rows: DailyStatusCountInput[],
  since: Date,
  until: Date = new Date(),
): DailySeriesPoint[] {
  const points = new Map<string, DailySeriesPoint>();

  let cursor = truncateToDay(since);
  const end = truncateToDay(until);
  while (cursor <= end) {
    const key = toDateKey(cursor);
    points.set(key, {
      date: key,
      SUCCESS: 0,
      PARTIAL: 0,
      FAILED: 0,
      PENDING: 0,
      PROCESSING: 0,
    });
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  for (const row of rows) {
    const key = toDateKey(row.day);
    const point = points.get(key);
    if (point && isStatusKey(row.status)) {
      point[row.status] = row.count;
    }
  }

  return [...points.values()];
}
