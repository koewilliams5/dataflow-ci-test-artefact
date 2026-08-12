import type { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { FileRowSource, RawRow } from "../types";
import { MalformedFileError } from "../types";

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function formatCellValue(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    // Format ISO tronqué (sans millisecondes/zone) — voir ASSUMPTIONS.md : les
    // colonnes date/datetime d'un fichier Excel doivent utiliser un
    // `dateFormat` compatible ISO (ex. "YYYY-MM-DD") pour un parsing fiable,
    // Excel stockant nativement les dates en valeur numérique, pas en texte.
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  if (typeof value === "object") {
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return String(value);
}

/**
 * Charge le classeur entier en mémoire plutôt que le lecteur streaming
 * d'exceljs : vu le plafond de 10 Mo (donc quelques dizaines de milliers de
 * lignes au plus), c'est un compromis raisonnable — le lecteur streaming
 * existe mais complexifierait significativement le code pour un gain
 * marginal à cette taille de fichier (voir DECISIONS.md).
 */
export async function readXlsxRowSource(input: Readable): Promise<FileRowSource> {
  const buffer = await streamToBuffer(input);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new MalformedFileError("Le fichier Excel est corrompu ou illisible.");
  }

  const firstSheet = workbook.worksheets[0];
  if (!firstSheet || firstSheet.rowCount === 0) {
    throw new MalformedFileError("Le classeur Excel ne contient aucune donnée exploitable.");
  }
  const worksheet: ExcelJS.Worksheet = firstSheet;

  const headerRow = worksheet.getRow(1);
  const columnCount = Math.max(headerRow.cellCount, worksheet.columnCount);
  const header: string[] = [];
  for (let col = 1; col <= columnCount; col += 1) {
    header.push(formatCellValue(headerRow.getCell(col).value).trim());
  }

  const dataRowCount = worksheet.rowCount;

  async function* rows(): AsyncIterable<RawRow> {
    let rowNumber = 1;
    for (let excelRow = 2; excelRow <= dataRowCount; excelRow += 1) {
      const row = worksheet.getRow(excelRow);
      if (row.cellCount === 0) {
        continue; // ligne complètement vide, ignorée (comme skip_empty_lines côté CSV)
      }
      const cells: string[] = [];
      for (let col = 1; col <= header.length; col += 1) {
        cells.push(formatCellValue(row.getCell(col).value));
      }
      yield { rowNumber, cells };
      rowNumber += 1;
    }
  }

  return { header, rows: rows() };
}
