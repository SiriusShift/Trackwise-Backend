-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN "endedAt" TIMESTAMP(3);

-- Backfill: schedules already cancelled/ended get an end timestamp
UPDATE "RecurringTransaction"
SET "endedAt" = "updatedAt"
WHERE "isActive" = false AND "endedAt" IS NULL;
