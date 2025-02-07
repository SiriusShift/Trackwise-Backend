/*
  Warnings:

  - You are about to drop the column `limit` on the `Category` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Category" DROP COLUMN "limit";

-- CreateTable
CREATE TABLE "CategoryTracker" (
    "id" SERIAL NOT NULL,
    "limit" DOUBLE PRECISION,
    "userId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "CategoryTracker_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CategoryTracker" ADD CONSTRAINT "CategoryTracker_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTracker" ADD CONSTRAINT "CategoryTracker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
