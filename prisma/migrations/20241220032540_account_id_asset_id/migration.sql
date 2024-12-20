/*
  Warnings:

  - You are about to drop the column `accountId` on the `TransactionHistory` table. All the data in the column will be lost.
  - Added the required column `assetId` to the `TransactionHistory` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "TransactionHistory" DROP CONSTRAINT "TransactionHistory_accountId_fkey";

-- AlterTable
ALTER TABLE "TransactionHistory" DROP COLUMN "accountId",
ADD COLUMN     "assetId" INTEGER NOT NULL;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
