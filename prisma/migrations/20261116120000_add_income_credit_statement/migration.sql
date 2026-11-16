-- AlterTable
ALTER TABLE "Income" ADD COLUMN     "creditStatementId" INTEGER;

-- CreateIndex
CREATE INDEX "Income_creditStatementId_idx" ON "Income"("creditStatementId");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_creditStatementId_fkey" FOREIGN KEY ("creditStatementId") REFERENCES "CreditStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
