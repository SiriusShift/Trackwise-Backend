/*
  Warnings:

  - You are about to drop the column `isDeleted` on the `Expense` table. All the data in the column will be lost.
  - The `status` column on the `Expense` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `type` column on the `Expense` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `assetId` on the `InstallmentPlan` table. All the data in the column will be lost.
  - You are about to drop the column `isDeleted` on the `TransactionHistory` table. All the data in the column will be lost.
  - Changed the type of `status` on the `Installment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "Status" AS ENUM ('Pending', 'Paid', 'Overdue', 'Partial');

-- CreateEnum
CREATE TYPE "Type" AS ENUM ('Expense', 'Recurring', 'Installment', 'Income', 'Transfer');

-- DropForeignKey
ALTER TABLE "InstallmentPlan" DROP CONSTRAINT "InstallmentPlan_assetId_fkey";

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "isDeleted",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "status",
ADD COLUMN     "status" "Status",
DROP COLUMN "type",
ADD COLUMN     "type" "Type" NOT NULL DEFAULT 'Expense';

-- AlterTable
ALTER TABLE "Income" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Installment" ADD COLUMN     "assetId" INTEGER,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
DROP COLUMN "status",
ADD COLUMN     "status" "Status" NOT NULL;

-- AlterTable
ALTER TABLE "InstallmentPlan" DROP COLUMN "assetId",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TransactionHistory" DROP COLUMN "isDeleted",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
