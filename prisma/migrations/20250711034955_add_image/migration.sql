/*
  Warnings:

  - Added the required column `image` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image` to the `Income` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image` to the `Transfer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "image" TEXT ;

-- AlterTable
ALTER TABLE "Income" ADD COLUMN     "image" TEXT ;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "image" TEXT;
