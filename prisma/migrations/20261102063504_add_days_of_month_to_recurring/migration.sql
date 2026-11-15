-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN     "daysOfMonth" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
