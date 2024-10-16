/*
  Warnings:

  - You are about to drop the column `userId` on the `email_verifications` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "email_verifications" DROP CONSTRAINT "email_verifications_userId_fkey";

-- AlterTable
ALTER TABLE "email_verifications" DROP COLUMN "userId";
