import { describe, expect, it } from "vitest";
import { parseDateWithFormat } from "./dateFormat";

describe("parseDateWithFormat", () => {
  it("parse une date au format YYYY-MM-DD", () => {
    const date = parseDateWithFormat("2026-02-14", "YYYY-MM-DD");
    expect(date?.toISOString()).toBe("2026-02-14T00:00:00.000Z");
  });

  it("parse une date-heure au format YYYY-MM-DD HH:mm:ss", () => {
    const date = parseDateWithFormat("2026-02-14 08:30:00", "YYYY-MM-DD HH:mm:ss");
    expect(date?.toISOString()).toBe("2026-02-14T08:30:00.000Z");
  });

  it("parse un format avec des séparateurs différents (DD/MM/YYYY)", () => {
    const date = parseDateWithFormat("14/02/2026", "DD/MM/YYYY");
    expect(date?.toISOString()).toBe("2026-02-14T00:00:00.000Z");
  });

  it("rejette une valeur qui ne correspond pas au format", () => {
    expect(parseDateWithFormat("14-02-2026", "YYYY-MM-DD")).toBeNull();
  });

  it("rejette une date calendaire inexistante (30 février)", () => {
    expect(parseDateWithFormat("2026-02-30", "YYYY-MM-DD")).toBeNull();
  });

  it("rejette une chaîne vide", () => {
    expect(parseDateWithFormat("", "YYYY-MM-DD")).toBeNull();
  });

  it("rejette du texte au lieu d'une date", () => {
    expect(parseDateWithFormat("hier", "YYYY-MM-DD")).toBeNull();
  });
});
