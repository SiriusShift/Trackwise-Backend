-- AlterTable
ALTER TABLE "Income" ADD COLUMN     "recurringDueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transfer" ADD COLUMN     "recurringDueDate" TIMESTAMP(3);
