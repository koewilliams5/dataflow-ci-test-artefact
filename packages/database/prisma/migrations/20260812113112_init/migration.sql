-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currentSchemaVersionId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_versions" (
    "id" UUID NOT NULL,
    "dataSourceId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schema_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestions" (
    "id" UUID NOT NULL,
    "dataSourceId" UUID NOT NULL,
    "schemaVersionId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "originalFileKey" TEXT NOT NULL,
    "validFileKey" TEXT,
    "checksum" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_errors" (
    "id" UUID NOT NULL,
    "ingestionId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "columnName" TEXT,
    "errorCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rawValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_currentSchemaVersionId_key" ON "data_sources"("currentSchemaVersionId");

-- CreateIndex
CREATE INDEX "data_sources_createdById_idx" ON "data_sources"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "schema_versions_dataSourceId_versionNumber_key" ON "schema_versions"("dataSourceId", "versionNumber");

-- CreateIndex
CREATE INDEX "ingestions_dataSourceId_createdAt_idx" ON "ingestions"("dataSourceId", "createdAt");

-- CreateIndex
CREATE INDEX "ingestions_schemaVersionId_idx" ON "ingestions"("schemaVersionId");

-- CreateIndex
CREATE INDEX "ingestions_status_idx" ON "ingestions"("status");

-- CreateIndex
CREATE INDEX "ingestions_dataSourceId_checksum_idx" ON "ingestions"("dataSourceId", "checksum");

-- CreateIndex
CREATE INDEX "ingestion_errors_ingestionId_rowNumber_idx" ON "ingestion_errors"("ingestionId", "rowNumber");

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_currentSchemaVersionId_fkey" FOREIGN KEY ("currentSchemaVersionId") REFERENCES "schema_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_versions" ADD CONSTRAINT "schema_versions_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_versions" ADD CONSTRAINT "schema_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestions" ADD CONSTRAINT "ingestions_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestions" ADD CONSTRAINT "ingestions_schemaVersionId_fkey" FOREIGN KEY ("schemaVersionId") REFERENCES "schema_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestions" ADD CONSTRAINT "ingestions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_errors" ADD CONSTRAINT "ingestion_errors_ingestionId_fkey" FOREIGN KEY ("ingestionId") REFERENCES "ingestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
