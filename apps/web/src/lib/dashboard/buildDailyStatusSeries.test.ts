import { describe, expect, it } from "vitest";
import { buildDailyStatusSeries } from "./buildDailyStatusSeries";

describe("buildDailyStatusSeries", () => {
  it("produit un point par jour entre since et until inclus, même sans données", () => {
    const series = buildDailyStatusSeries(
      [],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-03T00:00:00.000Z"),
    );

    expect(series).toEqual([
      { date: "2026-01-01", SUCCESS: 0, PARTIAL: 0, FAILED: 0, PENDING: 0, PROCESSING: 0 },
      { date: "2026-01-02", SUCCESS: 0, PARTIAL: 0, FAILED: 0, PENDING: 0, PROCESSING: 0 },
      { date: "2026-01-03", SUCCESS: 0, PARTIAL: 0, FAILED: 0, PENDING: 0, PROCESSING: 0 },
    ]);
  });

  it("place chaque compte sur le bon jour et le bon statut", () => {
    const series = buildDailyStatusSeries(
      [
        { day: new Date("2026-01-02T00:00:00.000Z"), status: "SUCCESS", count: 3 },
        { day: new Date("2026-01-02T00:00:00.000Z"), status: "FAILED", count: 1 },
      ],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-02T00:00:00.000Z"),
    );

    expect(series[0]).toMatchObject({ date: "2026-01-01", SUCCESS: 0 });
    expect(series[1]).toMatchObject({ date: "2026-01-02", SUCCESS: 3, FAILED: 1 });
  });

  it("ignore une ligne dont le jour tombe hors de la fenêtre demandée", () => {
    const series = buildDailyStatusSeries(
      [{ day: new Date("2026-02-15T00:00:00.000Z"), status: "SUCCESS", count: 5 }],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-03T00:00:00.000Z"),
    );

    expect(series.every((point) => point.SUCCESS === 0)).toBe(true);
  });

  it("ignore un statut inconnu sans lever d'erreur", () => {
    const series = buildDailyStatusSeries(
      [{ day: new Date("2026-01-01T00:00:00.000Z"), status: "UNKNOWN", count: 1 }],
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
    );

    expect(series).toEqual([
      { date: "2026-01-01", SUCCESS: 0, PARTIAL: 0, FAILED: 0, PENDING: 0, PROCESSING: 0 },
    ]);
  });
});
