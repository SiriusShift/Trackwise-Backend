/*
  Warnings:

  - You are about to drop the `CreditStatementFee` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CreditInstallmentPlanStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "CreditStatementFee" DROP CONSTRAINT "CreditStatementFee_creditStatementId_fkey";

-- AlterTable
ALTER TABLE "CreditStatement" ADD COLUMN     "otherFees" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "CreditStatementFee";

-- CreateTable
CREATE TABLE "CreditInstallmentPlan" (
    "id" SERIAL NOT NULL,
    "creditDetailId" INTEGER NOT NULL,
    "expenseId" INTEGER,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(20,2) NOT NULL,
    "monthlyAmount" DECIMAL(20,2) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "CreditInstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditInstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditInstallment" (
    "id" SERIAL NOT NULL,
    "planId" INTEGER NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "statementId" INTEGER,

    CONSTRAINT "CreditInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditInstallmentPlan_expenseId_key" ON "CreditInstallmentPlan"("expenseId");

-- CreateIndex
CREATE INDEX "CreditInstallmentPlan_creditDetailId_idx" ON "CreditInstallmentPlan"("creditDetailId");

-- CreateIndex
CREATE INDEX "CreditInstallment_planId_idx" ON "CreditInstallment"("planId");

-- CreateIndex
CREATE INDEX "CreditInstallment_statementId_idx" ON "CreditInstallment"("statementId");

-- CreateIndex
CREATE INDEX "CreditInstallment_dueDate_idx" ON "CreditInstallment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreditInstallment_planId_installmentNo_key" ON "CreditInstallment"("planId", "installmentNo");

-- AddForeignKey
ALTER TABLE "CreditInstallmentPlan" ADD CONSTRAINT "CreditInstallmentPlan_creditDetailId_fkey" FOREIGN KEY ("creditDetailId") REFERENCES "CreditDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditInstallmentPlan" ADD CONSTRAINT "CreditInstallmentPlan_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditInstallment" ADD CONSTRAINT "CreditInstallment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CreditInstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditInstallment" ADD CONSTRAINT "CreditInstallment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CreditStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
