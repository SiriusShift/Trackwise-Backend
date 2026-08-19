/*
  Warnings:

  - You are about to drop the column `minimumPayment` on the `CreditDetail` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CreditDetail" DROP COLUMN "minimumPayment",
ADD COLUMN     "minimumPaymentFloor" DECIMAL(20,2),
ADD COLUMN     "minimumPaymentPercent" DECIMAL(5,2);
