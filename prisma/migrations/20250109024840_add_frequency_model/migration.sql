/*
  Warnings:

  - You are about to drop the column `frequency` on the `Expense` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "frequency",
ADD COLUMN     "frequencyId" INTEGER;

-- CreateTable
CREATE TABLE "Frequency" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "interval" INTEGER,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Frequency_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_frequencyId_fkey" FOREIGN KEY ("frequencyId") REFERENCES "Frequency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
