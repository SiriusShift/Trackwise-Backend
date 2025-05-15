-- DropForeignKey
ALTER TABLE "TransactionHistory" DROP CONSTRAINT "TransactionHistory_fromAssetId_fkey";

-- DropForeignKey
ALTER TABLE "TransactionHistory" DROP CONSTRAINT "TransactionHistory_toAssetId_fkey";

-- AlterTable
ALTER TABLE "TransactionHistory" ALTER COLUMN "fromAssetId" DROP NOT NULL,
ALTER COLUMN "fromAssetId" DROP DEFAULT,
ALTER COLUMN "toAssetId" DROP NOT NULL,
ALTER COLUMN "toAssetId" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
