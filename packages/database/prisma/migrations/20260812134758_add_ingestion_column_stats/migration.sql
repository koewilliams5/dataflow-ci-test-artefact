-- CreateTable
CREATE TABLE "ingestion_column_stats" (
    "id" UUID NOT NULL,
    "ingestionId" UUID NOT NULL,
    "columnName" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL,
    "min" DOUBLE PRECISION NOT NULL,
    "max" DOUBLE PRECISION NOT NULL,
    "stddev" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_column_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_column_stats_ingestionId_columnName_key" ON "ingestion_column_stats"("ingestionId", "columnName");

-- AddForeignKey
ALTER TABLE "ingestion_column_stats" ADD CONSTRAINT "ingestion_column_stats_ingestionId_fkey" FOREIGN KEY ("ingestionId") REFERENCES "ingestions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
