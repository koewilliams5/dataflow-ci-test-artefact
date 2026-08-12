import type { Readable } from "node:stream";
import type { SchemaDefinition } from "@dataflow-ci/domain";
import type { ColumnStat } from "./columnStats";
import type { ErrorCode } from "./errorCodes";

export interface DetailedError {
  /** 0 = erreur de structure (en-têtes) ; >=1 = numéro de ligne de données (1-indexé, hors en-tête). */
  rowNumber: number;
  columnName: string | null;
  errorCode: ErrorCode;
  message: string;
  rawValue: string | null;
}

export type FileFormat = "csv" | "xlsx";

export interface ValidateFileInput {
  fileFormat: FileFormat;
  fileStream: Readable;
  schema: SchemaDefinition;
}

export interface ValidateFileResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: DetailedError[];
  /** Flux CSV des lignes valides — prêt à être uploadé tel quel. */
  validRowsCsv: Readable;
  /** Statistiques agrégées des colonnes numériques (integer/number) — voir ADR-038. */
  columnStats: ColumnStat[];
}

/** Ligne brute telle que lue par un parseur (CSV ou XLSX), avant toute validation. */
export interface RawRow {
  rowNumber: number;
  cells: string[];
}

export interface FileRowSource {
  header: string[];
  rows: AsyncIterable<RawRow>;
}

export class MalformedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedFileError";
  }
}
