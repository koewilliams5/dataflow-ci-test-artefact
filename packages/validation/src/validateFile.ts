import { validateCell } from "./cellValidation";
import { ColumnStatsCollector } from "./columnStats";
import { CsvExportWriter } from "./csvExport";
import { DuplicateTracker, buildDuplicateKey } from "./duplicateDetection";
import { validateHeader } from "./headerValidation";
import { readCsvRowSource } from "./parsers/csvRowSource";
import { readXlsxRowSource } from "./parsers/xlsxRowSource";
import type { DetailedError, ValidateFileInput, ValidateFileResult } from "./types";
import { MalformedFileError } from "./types";

function stringifyValue(value: string | number | boolean | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace("T", " ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function malformedResult(message: string): ValidateFileResult {
  return {
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    errors: [
      { rowNumber: 0, columnName: null, errorCode: "MALFORMED_FILE", message, rawValue: null },
    ],
    validRowsCsv: new CsvExportWriter([]).toReadable(),
    columnStats: [],
  };
}

/**
 * Moteur de validation — indépendant de Next.js, Prisma, Redis et BullMQ (ne
 * dépend que de @dataflow-ci/domain pour le type du schéma, et de parseurs
 * CSV/XLSX). Implémente les 13 étapes documentées dans DESIGN.md.
 */
export async function validateFile(input: ValidateFileInput): Promise<ValidateFileResult> {
  const { fileFormat, fileStream, schema } = input;

  let source;
  try {
    source =
      fileFormat === "csv"
        ? await readCsvRowSource(fileStream, schema.delimiter)
        : await readXlsxRowSource(fileStream);
  } catch (error) {
    return malformedResult(
      error instanceof MalformedFileError ? error.message : "Le fichier est illisible.",
    );
  }

  // Étapes 1-5 : en-têtes.
  const headerResult = validateHeader(source.header, schema);
  const exportColumnNames = source.header.filter(
    (_, index) => headerResult.columnByPosition[index] !== null,
  );
  const exportWriter = new CsvExportWriter(exportColumnNames);

  if (headerResult.errors.length > 0) {
    // Erreur de structure : impossible de mapper les colonnes de façon
    // fiable, on ne parcourt pas les lignes de données.
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      errors: headerResult.errors,
      validRowsCsv: exportWriter.toReadable(),
      columnStats: [],
    };
  }

  const duplicateTracker = new DuplicateTracker();
  const columnStatsCollector = new ColumnStatsCollector();
  const errors: DetailedError[] = [];
  let totalRows = 0;
  let validRows = 0;

  try {
    // Étapes 6-13 : parcours des lignes.
    for await (const row of source.rows) {
      totalRows += 1;
      const rowErrors: DetailedError[] = [];
      const valuesByColumn = new Map<string, string>();

      row.cells.forEach((rawCell, position) => {
        const column = headerResult.columnByPosition[position];
        if (!column) {
          return; // colonne en trop tolérée (allowExtraColumns) — ignorée
        }
        const outcome = validateCell(column, rawCell ?? "", row.rowNumber, schema.trimStrings);
        if (outcome.error) {
          rowErrors.push(outcome.error);
        } else if (outcome.value !== null) {
          valuesByColumn.set(column.name, stringifyValue(outcome.value));
          // Alimente les statistiques dès qu'une cellule numérique est valide,
          // indépendamment du reste de la ligne — voir ADR-038 : c'est la
          // distribution des valeurs de la colonne qui compte, pas seulement
          // celle des lignes entièrement valides.
          if (typeof outcome.value === "number") {
            columnStatsCollector.record(column.name, outcome.value);
          }
        }
      });

      if (
        rowErrors.length === 0 &&
        schema.duplicateKeyColumns &&
        schema.duplicateKeyColumns.length > 0
      ) {
        const key = buildDuplicateKey(valuesByColumn, schema.duplicateKeyColumns);
        if (duplicateTracker.isDuplicate(key)) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            columnName: null,
            errorCode: "DUPLICATE_ROW",
            message: `Ligne en double sur les colonnes clé (${schema.duplicateKeyColumns.join(", ")}).`,
            rawValue: null,
          });
        }
      }

      if (rowErrors.length === 0) {
        validRows += 1;
        exportWriter.addRow(valuesByColumn);
      } else {
        errors.push(...rowErrors);
      }
    }
  } catch (error) {
    // Fichier corrompu à partir d'un certain point (pas dès l'en-tête) : on
    // garde ce qui a été traité avec succès jusque-là et on documente l'arrêt.
    errors.push({
      rowNumber: totalRows + 1,
      columnName: null,
      errorCode: "MALFORMED_FILE",
      message:
        error instanceof MalformedFileError
          ? error.message
          : "Le fichier est devenu illisible en cours de lecture.",
      rawValue: null,
    });
  }

  return {
    totalRows,
    validRows,
    invalidRows: totalRows - validRows,
    errors,
    validRowsCsv: exportWriter.toReadable(),
    columnStats: columnStatsCollector.toStats(),
  };
}
