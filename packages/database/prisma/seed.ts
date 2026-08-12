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

// Reprend l'exemple donné dans le brief Artefact CI.
const ventesOrangeSchema: SchemaDefinition = {
  columns: [
    { name: "date", type: "date", required: true, unique: false, dateFormat: "YYYY-MM-DD" },
    {
      name: "region",
      type: "string",
      required: true,
      unique: false,
      allowedValues: ["Abidjan", "Bouaké", "Daloa", "Korhogo", "San-Pédro", "Yamoussoukro"],
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
      originalFilename: "ventes-clean.csv",
      originalFileKey: `sources/${dataSource.id}/uploads/ventes-clean.csv`,
      checksum: checksumOf("ventes-clean.csv-demo-content"),
    });
    await ingestionRepository.markIngestionProcessing(cleanIngestion.id);
    await ingestionRepository.completeIngestion(cleanIngestion.id, {
      status: "SUCCESS",
      totalRows: 120,
      validRows: 120,
      invalidRows: 0,
      validFileKey: `sources/${dataSource.id}/exports/${cleanIngestion.id}-valid.csv`,
    });

    const dirtyIngestion = await ingestionRepository.createIngestion({
      dataSourceId: dataSource.id,
      schemaVersionId: schemaVersion.id,
      createdById: user.id,
      originalFilename: "ventes-sale.csv",
      originalFileKey: `sources/${dataSource.id}/uploads/ventes-sale.csv`,
      checksum: checksumOf("ventes-sale.csv-demo-content"),
    });
    await ingestionRepository.markIngestionProcessing(dirtyIngestion.id);
    await ingestionRepository.appendIngestionErrors(dirtyIngestion.id, [
      {
        rowNumber: 4,
        columnName: "montant_fcfa",
        errorCode: "INVALID_INTEGER",
        message: 'Expected a positive integer, received "abc".',
        rawValue: "abc",
      },
      {
        rowNumber: 9,
        columnName: "client_id",
        errorCode: "REGEX_MISMATCH",
        message: 'Expected format CLI-\\d{6}, received "CLI-42".',
        rawValue: "CLI-42",
      },
      {
        rowNumber: 15,
        columnName: "client_id",
        errorCode: "DUPLICATE_ROW",
        message: "Duplicate value for key columns (client_id, date) within this file.",
        rawValue: "CLI-100045",
      },
    ]);
    await ingestionRepository.completeIngestion(dirtyIngestion.id, {
      status: "PARTIAL",
      totalRows: 118,
      validRows: 115,
      invalidRows: 3,
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
