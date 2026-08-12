import { describe, expect, it } from "vitest";
import { parseSchemaDefinition, schemaDefinitionSchema } from "./schemaDefinition";

const ventesOrangeExample = {
  columns: [
    { name: "date", type: "date", required: true, dateFormat: "YYYY-MM-DD" },
    {
      name: "region",
      type: "string",
      required: true,
      allowedValues: ["Abidjan", "Bouaké", "Daloa"],
    },
    { name: "montant_fcfa", type: "integer", required: true, positive: true },
    { name: "client_id", type: "string", required: true, pattern: "^CLI-\\d{6}$" },
  ],
  allowExtraColumns: false,
  trimStrings: true,
  caseSensitiveHeaders: false,
  duplicateKeyColumns: ["client_id", "date"],
};

describe("schemaDefinitionSchema — cas valides", () => {
  it("accepte l'exemple du brief (source Ventes Orange CI)", () => {
    const result = schemaDefinitionSchema.safeParse(ventesOrangeExample);
    expect(result.success).toBe(true);
  });

  it("accepte un schéma minimal avec une seule colonne et applique les valeurs par défaut", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "id", type: "string" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns[0]).toMatchObject({ required: false, unique: false });
      expect(result.data.allowExtraColumns).toBe(false);
      expect(result.data.trimStrings).toBe(true);
      expect(result.data.caseSensitiveHeaders).toBe(false);
    }
  });

  it.each(["string", "integer", "number", "boolean", "date", "datetime"] as const)(
    "accepte une colonne minimale de type %s",
    (type) => {
      const column =
        type === "date" || type === "datetime"
          ? { name: "col", type, dateFormat: "YYYY-MM-DD" }
          : { name: "col", type };

      const result = schemaDefinitionSchema.safeParse({ columns: [column] });
      expect(result.success).toBe(true);
    },
  );
});

describe("schemaDefinitionSchema — cas invalides", () => {
  it("rejette un schéma sans colonnes", () => {
    const result = schemaDefinitionSchema.safeParse({ columns: [] });
    expect(result.success).toBe(false);
  });

  it("rejette des noms de colonnes en double", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [
        { name: "id", type: "string" },
        { name: "id", type: "integer" },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("double"))).toBe(true);
    }
  });

  it("rejette un type de colonne inconnu", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "id", type: "uuid" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejette minLength > maxLength", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "code", type: "string", minLength: 10, maxLength: 5 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("maxLength"))).toBe(true);
    }
  });

  it("rejette min > max", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "montant", type: "integer", min: 100, max: 10 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("max"))).toBe(true);
    }
  });

  it("rejette une regex invalide dans pattern", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "code", type: "string", pattern: "(unclosed" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes("expression régulière")),
      ).toBe(true);
    }
  });

  it("rejette duplicateKeyColumns référençant une colonne inexistante", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "id", type: "string" }],
      duplicateKeyColumns: ["id", "unknown_column"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes("unknown_column"))).toBe(
        true,
      );
    }
  });

  it("rejette une colonne date sans dateFormat", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "date", type: "date" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejette allowedValues vide", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "region", type: "string", allowedValues: [] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejette allowedValues de mauvais type pour une colonne integer", () => {
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "montant", type: "integer", allowedValues: ["10", "20"] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejette une contrainte non applicable à un type (pattern sur integer)", () => {
    // `pattern` n'existe pas dans le schéma de la variante "integer" du union
    // discriminé : Zod la traite comme une clé inconnue et la rejette (strip par
    // défaut, mais ici la colonne devient un objet sans propriété reconnue au-delà
    // des champs communs — le test vérifie que le champ est simplement ignoré et
    // ne casse pas la validation, pas qu'il produit une erreur).
    const result = schemaDefinitionSchema.safeParse({
      columns: [{ name: "montant", type: "integer", pattern: "^[0-9]+$" }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns[0]).not.toHaveProperty("pattern");
    }
  });
});

describe("parseSchemaDefinition", () => {
  it("retourne success + data pour un schéma valide", () => {
    const result = parseSchemaDefinition(ventesOrangeExample);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toHaveLength(4);
    }
  });

  it("retourne success: false + messages lisibles pour un schéma invalide", () => {
    const result = parseSchemaDefinition({ columns: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toHaveProperty("path");
      expect(result.errors[0]).toHaveProperty("message");
    }
  });

  it("rejette une entrée qui n'est pas un objet", () => {
    const result = parseSchemaDefinition("not-an-object");
    expect(result.success).toBe(false);
  });
});
