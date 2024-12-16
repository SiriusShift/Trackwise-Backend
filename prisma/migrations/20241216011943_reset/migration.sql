/*
  Warnings:

  - You are about to drop the column `endDate` on the `RecurringExpense` table. All the data in the column will be lost.
  - You are about to drop the column `startDate` on the `RecurringExpense` table. All the data in the column will be lost.
  - Added the required column `recipient` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `date` to the `RecurringExpense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "recipient" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RecurringExpense" DROP COLUMN "endDate",
DROP COLUMN "startDate",
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL;
