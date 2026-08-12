import { describe, expect, it } from "vitest";
import { ColumnStatsCollector } from "./columnStats";

describe("ColumnStatsCollector", () => {
  it("ne retourne aucune statistique pour une colonne jamais alimentée", () => {
    const collector = new ColumnStatsCollector();
    expect(collector.toStats()).toEqual([]);
  });

  it("calcule moyenne/min/max correctement", () => {
    const collector = new ColumnStatsCollector();
    for (const value of [10, 20, 30, 40, 50]) {
      collector.record("montant_fcfa", value);
    }

    const [stat] = collector.toStats();
    expect(stat).toMatchObject({
      columnName: "montant_fcfa",
      count: 5,
      mean: 30,
      min: 10,
      max: 50,
    });
  });

  it("l'écart-type d'une seule valeur est 0 (pas NaN)", () => {
    const collector = new ColumnStatsCollector();
    collector.record("montant_fcfa", 42);

    const [stat] = collector.toStats();
    expect(stat?.stddev).toBe(0);
  });

  it("calcule un écart-type d'échantillon cohérent avec une formule de référence", () => {
    const collector = new ColumnStatsCollector();
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    for (const value of values) collector.record("x", value);

    const [stat] = collector.toStats();
    // Écart-type d'échantillon connu pour ce jeu de données classique : 2.13809...
    expect(stat?.stddev).toBeCloseTo(2.13809, 4);
  });

  it("suit plusieurs colonnes indépendamment", () => {
    const collector = new ColumnStatsCollector();
    collector.record("montant_fcfa", 100);
    collector.record("quantite", 3);
    collector.record("montant_fcfa", 200);

    const stats = collector.toStats();
    expect(stats).toHaveLength(2);
    expect(stats.find((s) => s.columnName === "montant_fcfa")?.count).toBe(2);
    expect(stats.find((s) => s.columnName === "quantite")?.count).toBe(1);
  });
});
