/*
  Warnings:

  - You are about to drop the `RecurringExpense` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `limit` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_recurringExpenseId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringExpense" DROP CONSTRAINT "RecurringExpense_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringExpense" DROP CONSTRAINT "RecurringExpense_userId_fkey";

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "isRecurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "limit" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "status" TEXT;

-- DropTable
DROP TABLE "RecurringExpense";

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
