-- AlterTable
ALTER TABLE "TransactionHistory" ADD COLUMN     "incomeId" INTEGER;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_incomeId_fkey" FOREIGN KEY ("incomeId") REFERENCES "Income"("id") ON DELETE SET NULL ON UPDATE CASCADE;
