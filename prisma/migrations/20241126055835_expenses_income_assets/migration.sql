/*
  Warnings:

  - Added the required column `recuring` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "recuring" BOOLEAN NOT NULL;
