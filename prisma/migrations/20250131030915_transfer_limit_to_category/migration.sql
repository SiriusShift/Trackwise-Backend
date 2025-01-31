/*
  Warnings:

  - You are about to drop the column `limit` on the `Expense` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "limit" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "limit";
