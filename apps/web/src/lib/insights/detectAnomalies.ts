// Voir ADR-037 et ASSUMPTIONS.md §9 : seuil et taille d'historique minimale
// tranchés de façon autonome, faciles à ajuster sans toucher à l'architecture.
export const ANOMALY_ZSCORE_THRESHOLD = 3;
export const ANOMALY_MIN_HISTORY_SIZE = 5;

export interface CurrentColumnStat {
  columnName: string;
  mean: number;
}

export interface HistoricalColumnSummary {
  columnName: string;
  sampleCount: number;
  avgMean: number;
  stddevMean: number | null;
}

export interface AnomalySignal {
  columnName: string;
  fileMean: number;
  historicalMean: number;
  zScore: number;
}

export interface DetectAnomaliesOptions {
  zScoreThreshold?: number;
  minHistorySize?: number;
}

/**
 * Compare la moyenne d'une colonne numérique du fichier à la distribution des
 * moyennes des ingestions passées de la même source (voir ADR-037 pour le
 * choix d'un z-score plutôt qu'un modèle ML entraîné). Fonction pure, aucun
 * accès base de données — les deux entrées sont déjà les agrégats calculés
 * par packages/validation et ingestionRepository.
 */
export function detectAnomalies(
  currentStats: CurrentColumnStat[],
  historicalSummaries: HistoricalColumnSummary[],
  options: DetectAnomaliesOptions = {},
): AnomalySignal[] {
  const threshold = options.zScoreThreshold ?? ANOMALY_ZSCORE_THRESHOLD;
  const minHistorySize = options.minHistorySize ?? ANOMALY_MIN_HISTORY_SIZE;

  const historyByColumn = new Map(
    historicalSummaries.map((summary) => [summary.columnName, summary]),
  );

  const signals: AnomalySignal[] = [];
  for (const current of currentStats) {
    const historical = historyByColumn.get(current.columnName);
    if (!historical || historical.sampleCount < minHistorySize) {
      continue; // historique insuffisant — jamais de faux signal sur peu de données
    }
    if (!historical.stddevMean || historical.stddevMean === 0) {
      continue; // écart-type nul ou indéfini — pas de z-score calculable proprement
    }

    const zScore = (current.mean - historical.avgMean) / historical.stddevMean;
    if (Math.abs(zScore) >= threshold) {
      signals.push({
        columnName: current.columnName,
        fileMean: current.mean,
        historicalMean: historical.avgMean,
        zScore,
      });
    }
  }
  return signals;
}
