-- DropForeignKey
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_toAssetId_fkey";

-- AlterTable
ALTER TABLE "Transfer" ALTER COLUMN "toAssetId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
