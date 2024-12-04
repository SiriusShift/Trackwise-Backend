/*
  Warnings:

  - Made the column `description` on table `Expense` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Expense" ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "status" DROP NOT NULL;
