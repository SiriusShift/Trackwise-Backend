/*
  Warnings:

  - You are about to drop the column `MONTH(date)` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `YEAR(date)` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `isRecurring` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `recipient` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `recurringExpenseId` on the `Expense` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "MONTH(date)",
DROP COLUMN "YEAR(date)",
DROP COLUMN "isRecurring",
DROP COLUMN "recipient",
DROP COLUMN "recurringExpenseId",
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "isScheduled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalExpenseId" INTEGER,
ADD COLUMN     "scheduleStartDate" TIMESTAMP(3);
