-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "CategoryTracker" ALTER COLUMN "isActive" SET DEFAULT true;
