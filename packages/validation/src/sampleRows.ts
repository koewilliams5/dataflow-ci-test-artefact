import type { Readable } from "node:stream";
import { readCsvRowSource } from "./parsers/csvRowSource";
import { readXlsxRowSource } from "./parsers/xlsxRowSource";
import type { FileFormat } from "./types";

export interface FileSample {
  header: string[];
  rows: string[][];
}

const DEFAULT_MAX_ROWS = 20;

/**
 * Lit l'en-tête et un échantillon de lignes brutes, sans schéma — utilisé par
 * l'assistant d'inférence de schéma (voir ADR-039), jamais par le pipeline de
 * validation lui-même qui exige toujours un schéma déjà défini. Peut lever
 * `MalformedFileError` (voir les parseurs) si le fichier est illisible.
 */
export async function readFileSample(
  fileFormat: FileFormat,
  fileStream: Readable,
  maxRows: number = DEFAULT_MAX_ROWS,
): Promise<FileSample> {
  const source =
    fileFormat === "csv" ? await readCsvRowSource(fileStream) : await readXlsxRowSource(fileStream);

  const rows: string[][] = [];
  for await (const row of source.rows) {
    rows.push(row.cells);
    if (rows.length >= maxRows) {
      break;
    }
  }

  return { header: source.header, rows };
}
