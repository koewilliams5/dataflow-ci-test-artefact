import { describe, expect, it } from "vitest";
import { detectAnomalies } from "./detectAnomalies";

describe("detectAnomalies", () => {
  it("ne signale rien quand la moyenne du fichier est proche de l'historique", () => {
    const signals = detectAnomalies(
      [{ columnName: "montant_fcfa", mean: 25500 }],
      [{ columnName: "montant_fcfa", sampleCount: 10, avgMean: 25000, stddevMean: 2000 }],
    );
    expect(signals).toEqual([]);
  });

  it("signale un écart significatif (z-score au-delà du seuil)", () => {
    const signals = detectAnomalies(
      [{ columnName: "montant_fcfa", mean: 2_400_000 }],
      [{ columnName: "montant_fcfa", sampleCount: 10, avgMean: 25_000, stddevMean: 5_000 }],
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ columnName: "montant_fcfa", fileMean: 2_400_000 });
    expect(signals[0]?.zScore).toBeGreaterThan(3);
  });

  it("ignore une colonne sans historique du tout", () => {
    const signals = detectAnomalies([{ columnName: "montant_fcfa", mean: 999_999 }], []);
    expect(signals).toEqual([]);
  });

  it("ignore un historique trop court (moins de 5 ingestions passées)", () => {
    const signals = detectAnomalies(
      [{ columnName: "montant_fcfa", mean: 2_400_000 }],
      [{ columnName: "montant_fcfa", sampleCount: 2, avgMean: 25_000, stddevMean: 1_000 }],
    );
    expect(signals).toEqual([]);
  });

  it("ignore un écart-type historique nul ou null (pas de division par zéro)", () => {
    const signalsNull = detectAnomalies(
      [{ columnName: "montant_fcfa", mean: 999_999 }],
      [{ columnName: "montant_fcfa", sampleCount: 10, avgMean: 25_000, stddevMean: null }],
    );
    const signalsZero = detectAnomalies(
      [{ columnName: "montant_fcfa", mean: 999_999 }],
      [{ columnName: "montant_fcfa", sampleCount: 10, avgMean: 25_000, stddevMean: 0 }],
    );
    expect(signalsNull).toEqual([]);
    expect(signalsZero).toEqual([]);
  });

  it("respecte un seuil et une taille d'historique personnalisés", () => {
    const signals = detectAnomalies(
      [{ columnName: "montant_fcfa", mean: 30_000 }],
      [{ columnName: "montant_fcfa", sampleCount: 3, avgMean: 25_000, stddevMean: 2_000 }],
      { zScoreThreshold: 2, minHistorySize: 3 },
    );
    expect(signals).toHaveLength(1);
  });

  it("évalue chaque colonne indépendamment", () => {
    const signals = detectAnomalies(
      [
        { columnName: "montant_fcfa", mean: 25_500 },
        { columnName: "quantite", mean: 500 },
      ],
      [
        { columnName: "montant_fcfa", sampleCount: 10, avgMean: 25_000, stddevMean: 2_000 },
        { columnName: "quantite", sampleCount: 10, avgMean: 10, stddevMean: 2 },
      ],
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]?.columnName).toBe("quantite");
  });
});
