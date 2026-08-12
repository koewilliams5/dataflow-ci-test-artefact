import type { ColumnDefinition } from "@dataflow-ci/domain";
import { parseDateWithFormat } from "./dateFormat";
import type { DetailedError } from "./types";

export interface CellValidationOutcome {
  /** Valeur convertie (null si absente/optionnelle, ou si un type ne s'y prête pas — ex. Date sérialisée en ISO côté appelant). */
  value: string | number | boolean | Date | null;
  error: DetailedError | null;
}

const TRUE_VALUES = new Set(["true", "1", "oui", "vrai"]);
const FALSE_VALUES = new Set(["false", "0", "non", "faux"]);
const INTEGER_PATTERN = /^-?\d+$/;
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;

function makeError(
  rowNumber: number,
  column: ColumnDefinition,
  errorCode: DetailedError["errorCode"],
  message: string,
  rawValue: string,
): CellValidationOutcome {
  return {
    value: null,
    error: { rowNumber, columnName: column.name, errorCode, message, rawValue },
  };
}

/**
 * Valide + convertit une cellule pour une colonne donnée (étapes 8-10 du
 * moteur : champ obligatoire, conversion de type, contraintes). S'arrête à
 * la première erreur rencontrée pour cette cellule — une cellule ne produit
 * jamais plus d'une erreur (simplification assumée, documentée en ADR).
 */
export function validateCell(
  column: ColumnDefinition,
  rawValue: string,
  rowNumber: number,
  trimStrings: boolean,
): CellValidationOutcome {
  const trimmed = trimStrings ? rawValue.trim() : rawValue;

  if (trimmed.length === 0) {
    if (column.required) {
      return makeError(
        rowNumber,
        column,
        "REQUIRED_VALUE",
        `La colonne "${column.name}" est obligatoire.`,
        rawValue,
      );
    }
    return { value: null, error: null };
  }

  switch (column.type) {
    case "string":
      return validateStringConstraints(column, trimmed, rowNumber, rawValue);
    case "integer":
      return validateIntegerConstraints(column, trimmed, rowNumber, rawValue);
    case "number":
      return validateNumberConstraints(column, trimmed, rowNumber, rawValue);
    case "boolean":
      return validateBoolean(column, trimmed, rowNumber, rawValue);
    case "date":
      return validateDateConstraints(column, trimmed, rowNumber, rawValue, "INVALID_DATE");
    case "datetime":
      return validateDateConstraints(column, trimmed, rowNumber, rawValue, "INVALID_DATETIME");
    default:
      return { value: trimmed, error: null };
  }
}

function validateStringConstraints(
  column: Extract<ColumnDefinition, { type: "string" }>,
  value: string,
  rowNumber: number,
  rawValue: string,
): CellValidationOutcome {
  if (column.allowedValues && !column.allowedValues.includes(value)) {
    return makeError(
      rowNumber,
      column,
      "VALUE_NOT_ALLOWED",
      `"${value}" n'est pas une valeur autorisée pour "${column.name}".`,
      rawValue,
    );
  }
  if (column.pattern) {
    let matches: boolean;
    try {
      matches = new RegExp(column.pattern).test(value);
    } catch {
      matches = false;
    }
    if (!matches) {
      return makeError(
        rowNumber,
        column,
        "REGEX_MISMATCH",
        `"${value}" ne respecte pas le format attendu pour "${column.name}".`,
        rawValue,
      );
    }
  }
  if (column.minLength !== undefined && value.length < column.minLength) {
    return makeError(
      rowNumber,
      column,
      "MIN_LENGTH",
      `"${column.name}" doit contenir au moins ${column.minLength} caractères.`,
      rawValue,
    );
  }
  if (column.maxLength !== undefined && value.length > column.maxLength) {
    return makeError(
      rowNumber,
      column,
      "MAX_LENGTH",
      `"${column.name}" ne peut pas dépasser ${column.maxLength} caractères.`,
      rawValue,
    );
  }
  return { value, error: null };
}

function validateIntegerConstraints(
  column: Extract<ColumnDefinition, { type: "integer" }>,
  value: string,
  rowNumber: number,
  rawValue: string,
): CellValidationOutcome {
  if (!INTEGER_PATTERN.test(value)) {
    return makeError(
      rowNumber,
      column,
      "INVALID_INTEGER",
      `"${value}" n'est pas un entier valide.`,
      rawValue,
    );
  }
  const numericValue = Number(value);
  return validateNumericRange(column, numericValue, rowNumber, rawValue);
}

function validateNumberConstraints(
  column: Extract<ColumnDefinition, { type: "number" }>,
  value: string,
  rowNumber: number,
  rawValue: string,
): CellValidationOutcome {
  if (!NUMBER_PATTERN.test(value)) {
    return makeError(
      rowNumber,
      column,
      "INVALID_NUMBER",
      `"${value}" n'est pas un nombre valide.`,
      rawValue,
    );
  }
  const numericValue = Number(value);
  return validateNumericRange(column, numericValue, rowNumber, rawValue);
}

function validateNumericRange(
  column: Extract<ColumnDefinition, { type: "integer" | "number" }>,
  numericValue: number,
  rowNumber: number,
  rawValue: string,
): CellValidationOutcome {
  if (column.allowedValues && !column.allowedValues.includes(numericValue)) {
    return makeError(
      rowNumber,
      column,
      "VALUE_NOT_ALLOWED",
      `"${numericValue}" n'est pas une valeur autorisée pour "${column.name}".`,
      rawValue,
    );
  }
  if (column.positive && numericValue <= 0) {
    return makeError(
      rowNumber,
      column,
      "NOT_POSITIVE",
      `"${column.name}" doit être un nombre positif.`,
      rawValue,
    );
  }
  if (column.min !== undefined && numericValue < column.min) {
    return makeError(
      rowNumber,
      column,
      "MIN_VALUE",
      `"${column.name}" doit être supérieur ou égal à ${column.min}.`,
      rawValue,
    );
  }
  if (column.max !== undefined && numericValue > column.max) {
    return makeError(
      rowNumber,
      column,
      "MAX_VALUE",
      `"${column.name}" doit être inférieur ou égal à ${column.max}.`,
      rawValue,
    );
  }
  return { value: numericValue, error: null };
}

function validateBoolean(
  column: Extract<ColumnDefinition, { type: "boolean" }>,
  value: string,
  rowNumber: number,
  rawValue: string,
): CellValidationOutcome {
  const normalized = value.toLowerCase();
  if (TRUE_VALUES.has(normalized)) return { value: true, error: null };
  if (FALSE_VALUES.has(normalized)) return { value: false, error: null };
  return makeError(
    rowNumber,
    column,
    "INVALID_BOOLEAN",
    `"${value}" n'est pas un booléen valide.`,
    rawValue,
  );
}

function validateDateConstraints(
  column: Extract<ColumnDefinition, { type: "date" | "datetime" }>,
  value: string,
  rowNumber: number,
  rawValue: string,
  invalidCode: "INVALID_DATE" | "INVALID_DATETIME",
): CellValidationOutcome {
  const parsed = parseDateWithFormat(value, column.dateFormat);
  if (!parsed) {
    return makeError(
      rowNumber,
      column,
      invalidCode,
      `"${value}" ne correspond pas au format attendu (${column.dateFormat}) pour "${column.name}".`,
      rawValue,
    );
  }
  if (column.min !== undefined) {
    const min = parseDateWithFormat(column.min, column.dateFormat);
    if (min && parsed < min) {
      return makeError(
        rowNumber,
        column,
        "MIN_VALUE",
        `"${column.name}" doit être postérieur ou égal à ${column.min}.`,
        rawValue,
      );
    }
  }
  if (column.max !== undefined) {
    const max = parseDateWithFormat(column.max, column.dateFormat);
    if (max && parsed > max) {
      return makeError(
        rowNumber,
        column,
        "MAX_VALUE",
        `"${column.name}" doit être antérieur ou égal à ${column.max}.`,
        rawValue,
      );
    }
  }
  return { value: parsed, error: null };
}
