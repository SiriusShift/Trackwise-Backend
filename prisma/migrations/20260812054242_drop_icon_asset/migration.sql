/*
  Warnings:

  - You are about to drop the column `icon` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `creditStatementId` on the `Expense` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_creditStatementId_fkey";

-- DropIndex
DROP INDEX "Expense_creditStatementId_idx";

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "icon";

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "creditStatementId";

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "creditStatementId" INTEGER;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_creditStatementId_fkey" FOREIGN KEY ("creditStatementId") REFERENCES "CreditStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
