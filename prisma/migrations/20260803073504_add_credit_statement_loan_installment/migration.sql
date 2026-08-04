/*
  Warnings:

  - You are about to drop the column `installmentId` on the `Expense` table. All the data in the column will be lost.
  - Added the required column `interestMethod` to the `LoanDetail` table without a default value. This is not possible if the table is not empty.
  - Added the required column `interestPeriod` to the `LoanDetail` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `LoanDetail` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LoanInstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "InterestMethod" AS ENUM ('ADD_ON', 'REDUCING_BALANCE');

-- CreateEnum
CREATE TYPE "InterestPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "CreditStatementStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "openedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "installmentId",
ADD COLUMN     "creditStatementId" INTEGER;

-- AlterTable
ALTER TABLE "LoanDetail" ADD COLUMN     "interestMethod" "InterestMethod" NOT NULL,
ADD COLUMN     "interestPeriod" "InterestPeriod" NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principal" DECIMAL(20,2) NOT NULL,
    "interest" DECIMAL(20,2) NOT NULL,
    "amountDue" DECIMAL(20,2) NOT NULL,
    "amountPaid" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "lateFeeCharged" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "LoanInstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "expenseId" INTEGER,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditStatement" (
    "id" SERIAL NOT NULL,
    "creditDetailId" INTEGER NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" DECIMAL(20,2) NOT NULL,
    "minimumPaymentDue" DECIMAL(20,2) NOT NULL,
    "amountPaid" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "interestCharged" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "lateFeeCharged" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "CreditStatementStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_expenseId_key" ON "LoanInstallment"("expenseId");

-- CreateIndex
CREATE INDEX "LoanInstallment_loanId_idx" ON "LoanInstallment"("loanId");

-- CreateIndex
CREATE INDEX "LoanInstallment_dueDate_idx" ON "LoanInstallment"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_loanId_installmentNo_key" ON "LoanInstallment"("loanId", "installmentNo");

-- CreateIndex
CREATE INDEX "CreditStatement_creditDetailId_idx" ON "CreditStatement"("creditDetailId");

-- CreateIndex
CREATE INDEX "CreditStatement_dueDate_idx" ON "CreditStatement"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CreditStatement_creditDetailId_statementDate_key" ON "CreditStatement"("creditDetailId", "statementDate");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Asset_userId_category_idx" ON "Asset"("userId", "category");

-- CreateIndex
CREATE INDEX "Asset_userId_isActive_idx" ON "Asset"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Expense_creditStatementId_idx" ON "Expense"("creditStatementId");

-- CreateIndex
CREATE INDEX "InvestmentPosition_symbol_idx" ON "InvestmentPosition"("symbol");

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "LoanDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditStatement" ADD CONSTRAINT "CreditStatement_creditDetailId_fkey" FOREIGN KEY ("creditDetailId") REFERENCES "CreditDetail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_creditStatementId_fkey" FOREIGN KEY ("creditStatementId") REFERENCES "CreditStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
