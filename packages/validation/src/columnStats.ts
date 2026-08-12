export interface ColumnStat {
  columnName: string;
  count: number;
  mean: number;
  min: number;
  max: number;
  stddev: number;
}

/**
 * Moyenne/écart-type/min/max en une seule passe, sans stocker les valeurs
 * individuelles — algorithme de Welford (stable numériquement, pas de somme
 * des carrés qui déborderait sur de grandes valeurs). Voir ADR-038 : ces
 * statistiques sont la seule trace persistée d'une colonne numérique, jamais
 * les valeurs elles-mêmes.
 */
class NumericAccumulator {
  count = 0;
  private mean = 0;
  private m2 = 0;
  private min = Infinity;
  private max = -Infinity;

  add(value: number): void {
    this.count += 1;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
  }

  toStat(columnName: string): ColumnStat | null {
    if (this.count === 0) {
      return null;
    }
    // Variance d'échantillon (n-1) — cohérent avec STDDEV() de Postgres côté
    // historique (voir ingestionRepository.getHistoricalColumnStatsSummary).
    const variance = this.count > 1 ? this.m2 / (this.count - 1) : 0;
    return {
      columnName,
      count: this.count,
      mean: this.mean,
      min: this.min,
      max: this.max,
      stddev: Math.sqrt(variance),
    };
  }
}

/** Une accumulation par colonne numérique rencontrée pendant la validation d'un fichier. */
export class ColumnStatsCollector {
  private readonly accumulators = new Map<string, NumericAccumulator>();

  record(columnName: string, value: number): void {
    let accumulator = this.accumulators.get(columnName);
    if (!accumulator) {
      accumulator = new NumericAccumulator();
      this.accumulators.set(columnName, accumulator);
    }
    accumulator.add(value);
  }

  toStats(): ColumnStat[] {
    const stats: ColumnStat[] = [];
    for (const [columnName, accumulator] of this.accumulators) {
      const stat = accumulator.toStat(columnName);
      if (stat) {
        stats.push(stat);
      }
    }
    return stats;
  }
}
