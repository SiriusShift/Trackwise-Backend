-- AlterTable
ALTER TABLE "SavingsGoal" ADD COLUMN "currentAmount" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- Backfill: each asset's saving target becomes a goal linked to that asset,
-- unless the asset already has a goal with the same target amount
INSERT INTO "SavingsGoal" ("name", "targetAmount", "targetDate", "userId", "assetId", "updatedAt")
SELECT a."name", sd."targetAmount", sd."targetDate", a."userId", a."id", CURRENT_TIMESTAMP
FROM "SavingDetail" sd
JOIN "Asset" a ON a."id" = sd."assetId"
WHERE NOT EXISTS (
    SELECT 1 FROM "SavingsGoal" g
    WHERE g."assetId" = sd."assetId" AND g."targetAmount" = sd."targetAmount"
);

-- DropForeignKey
ALTER TABLE "SavingDetail" DROP CONSTRAINT "SavingDetail_assetId_fkey";

-- DropTable
DROP TABLE "SavingDetail";
