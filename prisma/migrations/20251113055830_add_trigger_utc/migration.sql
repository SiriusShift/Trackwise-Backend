/*
  Warnings:

  - Added the required column `nextTriggerUTC` to the `RecurringTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RecurringTransaction" ADD COLUMN  "nextTriggerUTC" TIMESTAMP(3);
