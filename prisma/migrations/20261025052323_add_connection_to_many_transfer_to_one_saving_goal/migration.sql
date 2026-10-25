-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "goalId" INTEGER;

-- CreateIndex
CREATE INDEX "Transfer_goalId_idx" ON "Transfer"("goalId");

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
