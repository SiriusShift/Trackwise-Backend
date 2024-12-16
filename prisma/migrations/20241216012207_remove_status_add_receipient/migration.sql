/*
  Warnings:

  - You are about to drop the column `recurring` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Expense` table. All the data in the column will be lost.
  - Added the required column `recipient` to the `RecurringExpense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "recurring",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "RecurringExpense" ADD COLUMN     "recipient" TEXT NOT NULL;
