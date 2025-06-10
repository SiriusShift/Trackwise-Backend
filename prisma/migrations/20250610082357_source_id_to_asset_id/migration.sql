/*
  Warnings:

  - You are about to drop the column `sourceId` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `sourceId` on the `Income` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_sourceId_fkey";

-- DropForeignKey
ALTER TABLE "Income" DROP CONSTRAINT "Income_sourceId_fkey";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "sourceId",
ADD COLUMN     "assetId" INTEGER;

-- AlterTable
ALTER TABLE "Income" DROP COLUMN "sourceId",
ADD COLUMN     "assetId" INTEGER;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
