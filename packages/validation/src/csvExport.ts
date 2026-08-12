import { Readable } from "node:stream";
import { stringify } from "csv-stringify/sync";
import { sanitizeForCsvExport } from "./csvInjection";

/**
 * Accumule les lignes valides puis produit un flux CSV unique à la fin —
 * voir DECISIONS.md pour pourquoi (fichier plafonné à 10 Mo, un vrai flux de
 * sortie streamé en temps réel n'apporterait rien à cette échelle).
 */
export class CsvExportWriter {
  private readonly columnNames: string[];
  private readonly rows: string[][] = [];

  constructor(columnNames: string[]) {
    this.columnNames = columnNames;
  }

  addRow(valuesByColumn: Map<string, string>): void {
    this.rows.push(
      this.columnNames.map((name) => sanitizeForCsvExport(valuesByColumn.get(name) ?? "")),
    );
  }

  get rowCount(): number {
    return this.rows.length;
  }

  toCsvString(): string {
    return stringify([this.columnNames, ...this.rows]);
  }

  toReadable(): Readable {
    return Readable.from([this.toCsvString()]);
  }
}
