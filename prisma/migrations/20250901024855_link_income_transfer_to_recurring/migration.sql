/*
  Warnings:

  - You are about to drop the column `type` on the `Expense` table. All the data in the column will be lost.
  - The `status` column on the `Income` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `transactionType` on the `TransactionHistory` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Status" ADD VALUE 'Received';
ALTER TYPE "Status" ADD VALUE 'Completed';
ALTER TYPE "Status" ADD VALUE 'Cancelled';
ALTER TYPE "Status" ADD VALUE 'Failed';

-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "type";

-- AlterTable
ALTER TABLE "Income" ADD COLUMN     "recurringId" INTEGER,
DROP COLUMN "status",
ADD COLUMN     "status" "Status" DEFAULT 'Pending';

-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN     "auto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TransactionHistory" ADD COLUMN     "transferId" INTEGER,
DROP COLUMN "transactionType",
ADD COLUMN     "transactionType" "Type" NOT NULL;

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "recurringId" INTEGER,
ADD COLUMN     "status" "Status" NOT NULL DEFAULT 'Pending';

-- DropEnum
DROP TYPE "RecurringType";

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionHistory" ADD CONSTRAINT "TransactionHistory_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
