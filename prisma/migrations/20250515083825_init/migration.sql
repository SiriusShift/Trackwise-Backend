/*
  Warnings:

  - You are about to drop the column `assetId` on the `TransactionHistory` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "TransactionHistory" DROP CONSTRAINT "TransactionHistory_assetId_fkey";

-- AlterTable
ALTER TABLE "TransactionHistory" DROP COLUMN "assetId",
ADD COLUMN     "fromAssetId" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "toAssetId" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
