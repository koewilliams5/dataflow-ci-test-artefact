import { describe, expect, it } from "vitest";
import { CsvExportWriter } from "./csvExport";

describe("CsvExportWriter", () => {
  it("écrit l'en-tête puis les lignes dans l'ordre des colonnes données", () => {
    const writer = new CsvExportWriter(["region", "montant_fcfa"]);
    writer.addRow(
      new Map([
        ["region", "Abidjan"],
        ["montant_fcfa", "1000"],
      ]),
    );
    writer.addRow(
      new Map([
        ["region", "Daloa"],
        ["montant_fcfa", "2000"],
      ]),
    );

    const csv = writer.toCsvString();

    expect(csv).toBe("region,montant_fcfa\nAbidjan,1000\nDaloa,2000\n");
  });

  it("neutralise les valeurs commençant par =, +, - ou @ (injection CSV)", () => {
    const writer = new CsvExportWriter(["region"]);
    writer.addRow(new Map([["region", "=cmd|'/c calc'!A1"]]));

    const csv = writer.toCsvString();

    expect(csv).toContain("'=cmd|'/c calc'!A1");
  });

  it("écrit une chaîne vide pour une colonne absente de la ligne", () => {
    const writer = new CsvExportWriter(["region", "note"]);
    writer.addRow(new Map([["region", "Abidjan"]]));

    expect(writer.toCsvString()).toBe("region,note\nAbidjan,\n");
  });

  it("expose le nombre de lignes ajoutées", () => {
    const writer = new CsvExportWriter(["region"]);
    writer.addRow(new Map([["region", "Abidjan"]]));
    writer.addRow(new Map([["region", "Daloa"]]));

    expect(writer.rowCount).toBe(2);
  });
});
