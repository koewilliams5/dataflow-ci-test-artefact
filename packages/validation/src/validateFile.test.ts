import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { SchemaDefinition } from "@dataflow-ci/domain";
import { describe, expect, it } from "vitest";
import { validateFile } from "./validateFile";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));

function fixtureStream(name: string): Readable {
  return createReadStream(`${fixturesDir}${name}`);
}

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

const schema: SchemaDefinition = {
  columns: [
    { name: "date", type: "date", required: true, unique: false, dateFormat: "YYYY-MM-DD" },
    {
      name: "region",
      type: "string",
      required: true,
      unique: false,
      allowedValues: ["Abidjan", "Bouaké", "Daloa"],
    },
    { name: "montant_fcfa", type: "integer", required: true, unique: false, positive: true },
    {
      name: "client_id",
      type: "string",
      required: true,
      unique: false,
      pattern: "^CLI-\\d{6}$",
    },
  ],
  allowExtraColumns: false,
  trimStrings: true,
  caseSensitiveHeaders: false,
  duplicateKeyColumns: ["client_id", "date"],
};

describe("validateFile", () => {
  it("accepte un fichier CSV entièrement propre", async () => {
    const result = await validateFile({
      fileFormat: "csv",
      fileStream: fixtureStream("clean.csv"),
      schema,
    });

    expect(result.errors).toEqual([]);
    expect(result.totalRows).toBe(result.validRows);
    expect(result.invalidRows).toBe(0);
    expect(result.validRows).toBeGreaterThan(0);

    const csv = await readAll(result.validRowsCsv);
    expect(csv).toContain("date,region,montant_fcfa,client_id");

    const montantStat = result.columnStats.find((stat) => stat.columnName === "montant_fcfa");
    expect(montantStat).toMatchObject({ count: 3, mean: 15000, min: 5000, max: 25000 });
  });

  it("isole les lignes invalides d'un fichier partiellement valide", async () => {
    const result = await validateFile({
      fileFormat: "csv",
      fileStream: fixtureStream("partially-invalid.csv"),
      schema,
    });

    expect(result.totalRows).toBe(5);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(3);

    const codes = result.errors.map((error) => error.errorCode).sort();
    expect(codes).toEqual(["INVALID_INTEGER", "REGEX_MISMATCH", "VALUE_NOT_ALLOWED"]);
  });

  it("rejette toutes les lignes d'un fichier entièrement invalide", async () => {
    const result = await validateFile({
      fileFormat: "csv",
      fileStream: fixtureStream("fully-invalid.csv"),
      schema,
    });

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(0);
    expect(result.invalidRows).toBe(3);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("signale un fichier vide (aucune ligne de données) comme malformé", async () => {
    const result = await validateFile({
      fileFormat: "csv",
      fileStream: fixtureStream("empty.csv"),
      schema,
    });

    expect(result.totalRows).toBe(0);
    expect(result.validRows).toBe(0);
  });

  it("détecte les doublons sur les colonnes clé", async () => {
    const result = await validateFile({
      fileFormat: "csv",
      fileStream: fixtureStream("duplicates.csv"),
      schema,
    });

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.errorCode).toBe("DUPLICATE_ROW");
    expect(result.errors[0]?.rowNumber).toBe(2);
  });

  it("rejette une colonne non déclarée quand allowExtraColumns est false", async () => {
    const result = await validateFile({
      fileFormat: "csv",
      fileStream: fixtureStream("extra-columns.csv"),
      schema,
    });

    expect(result.totalRows).toBe(0);
    expect(result.validRows).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.errorCode).toBe("EXTRA_COLUMN");
    expect(result.errors[0]?.rowNumber).toBe(0);
  });

  it("tolère une colonne non déclarée quand allowExtraColumns est true", async () => {
    const permissiveSchema: SchemaDefinition = { ...schema, allowExtraColumns: true };

    const result = await validateFile({
      fileFormat: "csv",
      fileStream: fixtureStream("extra-columns.csv"),
      schema: permissiveSchema,
    });

    expect(result.errors).toEqual([]);
    expect(result.validRows).toBe(1);

    const csv = await readAll(result.validRowsCsv);
    expect(csv).not.toContain("commentaire_libre");
  });

  it("signale un classeur Excel corrompu comme fichier malformé", async () => {
    const result = await validateFile({
      fileFormat: "xlsx",
      fileStream: fixtureStream("corrupted.xlsx"),
      schema,
    });

    expect(result.totalRows).toBe(0);
    expect(result.validRows).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.errorCode).toBe("MALFORMED_FILE");
  });
});
