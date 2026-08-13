import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { SchemaDefinition } from "@dataflow-ci/domain";
import { prisma } from "../src/client";
import * as userRepository from "../src/repositories/userRepository";
import * as dataSourceRepository from "../src/repositories/dataSourceRepository";
import * as schemaVersionRepository from "../src/repositories/schemaVersionRepository";
import * as ingestionRepository from "../src/repositories/ingestionRepository";

const DEMO_USER_EMAIL = "demo@dataflow-ci.com";
const DEMO_USER_PASSWORD = "password123";
const DEMO_SOURCE_NAME = "Ventes Orange CI - Hebdo";

// Schéma exact du dépôt de départ Artefact CI (data/source-ventes-orange.json,
// voir samples/source-ventes-orange.json) — récupéré le 2026-08-13, après avoir
// eu accès au dépôt (indisponible pendant le développement initial, voir
// ASSUMPTIONS.md pour l'historique).
const ventesOrangeSchema: SchemaDefinition = {
  columns: [
    { name: "date_vente", type: "date", required: true, unique: false, dateFormat: "YYYY-MM-DD" },
    {
      name: "agence_code",
      type: "string",
      required: true,
      unique: false,
      pattern: "^AG-[A-Z]{3}-\\d{4}$",
    },
    {
      name: "region",
      type: "string",
      required: true,
      unique: false,
      allowedValues: [
        "Abidjan",
        "Bouaké",
        "Yamoussoukro",
        "Daloa",
        "San-Pédro",
        "Korhogo",
        "Man",
        "Gagnoa",
      ],
    },
    {
      name: "type_forfait",
      type: "string",
      required: true,
      unique: false,
      allowedValues: ["prepaid", "postpaid", "data_only", "fiber"],
    },
    { name: "quantite", type: "integer", required: true, unique: false, min: 1, max: 10000 },
    { name: "montant_fcfa", type: "integer", required: true, unique: false, min: 0 },
    {
      name: "client_segment",
      type: "string",
      required: false,
      unique: false,
      allowedValues: ["B2C", "B2B", "VIP"],
    },
    {
      name: "commercial_email",
      type: "string",
      required: true,
      unique: false,
      pattern: "^[a-zA-Z0-9._-]+@orange\\.ci$",
    },
  ],
  allowExtraColumns: false,
  trimStrings: true,
  caseSensitiveHeaders: false,
  duplicateKeyColumns: ["date_vente", "agence_code", "type_forfait"],
  delimiter: ",",
};

function checksumOf(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);
  const user =
    (await userRepository.findUserByEmail(DEMO_USER_EMAIL)) ??
    (await userRepository.createUser({ email: DEMO_USER_EMAIL, passwordHash }));

  let dataSource = await prisma.dataSource.findFirst({ where: { name: DEMO_SOURCE_NAME } });
  dataSource ??= await dataSourceRepository.createDataSource({
    name: DEMO_SOURCE_NAME,
    description: "Export hebdomadaire des ventes Orange CI, format fourni par le client.",
    createdById: user.id,
  });

  const existingVersions = await schemaVersionRepository.listSchemaVersions(dataSource.id);
  const schemaVersion =
    existingVersions[0] ??
    (await schemaVersionRepository.createSchemaVersion({
      dataSourceId: dataSource.id,
      definition: ventesOrangeSchema,
      createdById: user.id,
    }));

  const existingIngestions = await ingestionRepository.listIngestionsForDataSource(dataSource.id);
  if (existingIngestions.length === 0) {
    const cleanIngestion = await ingestionRepository.createIngestion({
      dataSourceId: dataSource.id,
      schemaVersionId: schemaVersion.id,
      createdById: user.id,
      originalFilename: "ventes-orange-clean.csv",
      originalFileKey: `sources/${dataSource.id}/uploads/ventes-orange-clean.csv`,
      checksum: checksumOf("ventes-orange-clean.csv-demo-content"),
    });
    await ingestionRepository.markIngestionProcessing(cleanIngestion.id);
    await ingestionRepository.completeIngestion(cleanIngestion.id, {
      status: "SUCCESS",
      totalRows: 120,
      validRows: 120,
      invalidRows: 0,
      validFileKey: `sources/${dataSource.id}/exports/${cleanIngestion.id}-valid.csv`,
    });

    // Chiffres et erreurs ci-dessous vérifiés en faisant tourner le vrai moteur
    // (packages/validation) contre samples/ventes-orange-dirty.csv et ce même
    // schéma, le 2026-08-13 — pas des valeurs inventées. Seul un sous-ensemble
    // des 24 erreurs réelles est repris ici, pour rester lisible en démo.
    const dirtyIngestion = await ingestionRepository.createIngestion({
      dataSourceId: dataSource.id,
      schemaVersionId: schemaVersion.id,
      createdById: user.id,
      originalFilename: "ventes-orange-dirty.csv",
      originalFileKey: `sources/${dataSource.id}/uploads/ventes-orange-dirty.csv`,
      checksum: checksumOf("ventes-orange-dirty.csv-demo-content"),
    });
    await ingestionRepository.markIngestionProcessing(dirtyIngestion.id);
    await ingestionRepository.appendIngestionErrors(dirtyIngestion.id, [
      {
        rowNumber: 54,
        columnName: "region",
        errorCode: "VALUE_NOT_ALLOWED",
        message: '"Marcory" n\'est pas une valeur autorisée pour "region".',
        rawValue: "Marcory",
      },
      {
        rowNumber: 58,
        columnName: "quantite",
        errorCode: "INVALID_INTEGER",
        message: '"douze" n\'est pas un entier valide.',
        rawValue: "douze",
      },
      {
        rowNumber: 60,
        columnName: "commercial_email",
        errorCode: "REGEX_MISMATCH",
        message: '"k.kouassi@gmail.com" ne respecte pas le format attendu pour "commercial_email".',
        rawValue: "k.kouassi@gmail.com",
      },
      {
        rowNumber: 67,
        columnName: null,
        errorCode: "DUPLICATE_ROW",
        message: "Ligne en double sur les colonnes clé (date_vente, agence_code, type_forfait).",
        rawValue: null,
      },
    ]);
    await ingestionRepository.completeIngestion(dirtyIngestion.id, {
      status: "PARTIAL",
      totalRows: 70,
      validRows: 53,
      invalidRows: 17,
      validFileKey: `sources/${dataSource.id}/exports/${dirtyIngestion.id}-valid.csv`,
    });
  }

  console.log("Seed complete:");
  console.log(`  user:           ${user.email} (password: ${DEMO_USER_PASSWORD})`);
  console.log(`  data source:    ${dataSource.name} (${dataSource.id})`);
  console.log(`  schema version: v${schemaVersion.versionNumber} (${schemaVersion.id})`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
