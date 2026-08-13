import type { SchemaDefinition } from "@dataflow-ci/domain";
import { describe, expect, it } from "vitest";
import { validateHeader } from "./headerValidation";

const SCHEMA: SchemaDefinition = {
  columns: [
    { name: "date", type: "date", required: true, unique: false, dateFormat: "YYYY-MM-DD" },
    { name: "region", type: "string", required: true, unique: false },
    { name: "note", type: "string", required: false, unique: false },
  ],
  allowExtraColumns: false,
  trimStrings: true,
  caseSensitiveHeaders: false,
  delimiter: ",",
};

describe("validateHeader", () => {
  it("aucune erreur pour un en-tête qui correspond exactement au schéma", () => {
    const result = validateHeader(["date", "region", "note"], SCHEMA);
    expect(result.errors).toHaveLength(0);
  });

  it("MISSING_REQUIRED_COLUMN si une colonne obligatoire est absente", () => {
    const result = validateHeader(["date"], SCHEMA);
    expect(result.errors.map((e) => e.errorCode)).toContain("MISSING_REQUIRED_COLUMN");
  });

  it("pas d'erreur si une colonne optionnelle est absente", () => {
    const result = validateHeader(["date", "region"], SCHEMA);
    expect(result.errors).toHaveLength(0);
  });

  it("DUPLICATE_HEADER si un en-tête apparaît deux fois", () => {
    const result = validateHeader(["date", "region", "region"], SCHEMA);
    expect(result.errors.map((e) => e.errorCode)).toContain("DUPLICATE_HEADER");
  });

  it("EXTRA_COLUMN si allowExtraColumns est false et qu'une colonne inconnue est présente", () => {
    const result = validateHeader(["date", "region", "colonne_inconnue"], SCHEMA);
    expect(result.errors.map((e) => e.errorCode)).toContain("EXTRA_COLUMN");
  });

  it("pas d'erreur EXTRA_COLUMN si allowExtraColumns est true", () => {
    const permissiveSchema: SchemaDefinition = { ...SCHEMA, allowExtraColumns: true };
    const result = validateHeader(["date", "region", "colonne_inconnue"], permissiveSchema);
    expect(result.errors.map((e) => e.errorCode)).not.toContain("EXTRA_COLUMN");
  });

  it("comparaison insensible à la casse par défaut (caseSensitiveHeaders: false)", () => {
    const result = validateHeader(["DATE", "Region", "Note"], SCHEMA);
    expect(result.errors).toHaveLength(0);
  });

  it("comparaison sensible à la casse si caseSensitiveHeaders: true", () => {
    const strictSchema: SchemaDefinition = { ...SCHEMA, caseSensitiveHeaders: true };
    const result = validateHeader(["DATE", "region", "note"], strictSchema);
    expect(result.errors.map((e) => e.errorCode)).toContain("MISSING_REQUIRED_COLUMN");
  });

  it("construit correctement le mapping position -> colonne", () => {
    const result = validateHeader(["region", "date"], SCHEMA);
    expect(result.columnByPosition[0]?.name).toBe("region");
    expect(result.columnByPosition[1]?.name).toBe("date");
  });
});
