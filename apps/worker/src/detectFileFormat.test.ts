import { describe, expect, it } from "vitest";
import { detectFileFormat } from "./detectFileFormat";

describe("detectFileFormat", () => {
  it("reconnaît un fichier .csv", () => {
    expect(detectFileFormat("ventes.csv")).toBe("csv");
  });

  it("reconnaît un fichier .xlsx (insensible à la casse)", () => {
    expect(detectFileFormat("ventes.XLSX")).toBe("xlsx");
  });

  it("lève pour toute autre extension (ne devrait jamais arriver après validation à l'upload)", () => {
    expect(() => detectFileFormat("ventes.txt")).toThrow(/non supportée/);
  });
});
