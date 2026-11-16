-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "isPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "postedDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Expense_assetId_isPending_idx" ON "Expense"("assetId", "isPending");
