/*
  Warnings:

  - You are about to drop the column `minimumPaymentFloor` on the `CreditDetail` table. All the data in the column will be lost.
  - You are about to drop the column `minimumPaymentPercent` on the `CreditDetail` table. All the data in the column will be lost.
  - You are about to drop the column `amountPaid` on the `CreditStatement` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CreditDetail" DROP COLUMN "minimumPaymentFloor",
DROP COLUMN "minimumPaymentPercent";

-- AlterTable
ALTER TABLE "CreditStatement" DROP COLUMN "amountPaid";

-- CreateTable
CREATE TABLE "CreditStatementFee" (
    "id" SERIAL NOT NULL,
    "creditStatementId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditStatementFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditStatementFee_creditStatementId_idx" ON "CreditStatementFee"("creditStatementId");

-- AddForeignKey
ALTER TABLE "CreditStatementFee" ADD CONSTRAINT "CreditStatementFee_creditStatementId_fkey" FOREIGN KEY ("creditStatementId") REFERENCES "CreditStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
