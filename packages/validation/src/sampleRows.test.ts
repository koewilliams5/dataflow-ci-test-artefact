import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readFileSample } from "./sampleRows";

function csvStream(content: string): Readable {
  return Readable.from([content]);
}

describe("readFileSample", () => {
  it("retourne l'en-tête et les lignes d'un CSV", async () => {
    const sample = await readFileSample(
      "csv",
      csvStream("date,region,montant_fcfa\n2026-01-01,Abidjan,5000\n2026-01-02,Bouaké,7000\n"),
    );

    expect(sample.header).toEqual(["date", "region", "montant_fcfa"]);
    expect(sample.rows).toEqual([
      ["2026-01-01", "Abidjan", "5000"],
      ["2026-01-02", "Bouaké", "7000"],
    ]);
  });

  it("plafonne le nombre de lignes lues (maxRows)", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `2026-01-01,Abidjan,${i}`).join("\n");
    const sample = await readFileSample(
      "csv",
      csvStream(`date,region,montant_fcfa\n${lines}\n`),
      5,
    );

    expect(sample.rows).toHaveLength(5);
  });
});
