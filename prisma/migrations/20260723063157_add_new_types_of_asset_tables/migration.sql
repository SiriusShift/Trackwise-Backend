/*
  Warnings:

  - You are about to drop the column `creditLimit` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Asset` table. All the data in the column will be lost.
  - You are about to alter the column `balance` on the `Asset` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(20,8)`.
  - Added the required column `category` to the `Asset` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('CASH', 'BANK', 'CREDIT', 'LOAN', 'INVESTMENT');

-- CreateEnum
CREATE TYPE "AssetSubtype" AS ENUM ('SAVINGS', 'CHECKING', 'E_WALLET', 'CREDIT_CARD', 'LINE_OF_CREDIT', 'PERSONAL', 'HOME', 'AUTO', 'STOCK', 'ETF', 'CRYPTO', 'MUTUAL_FUND', 'BOND');

-- DropIndex
DROP INDEX "Asset_userId_idx";

-- Step 1: add category as NULLABLE first (so existing rows don't break)
ALTER TABLE "Asset" ADD COLUMN "category" "AssetCategory";

-- Step 2: backfill category from the old "type" column, BEFORE dropping it
-- Adjust the CASE mapping to match whatever values "type" actually holds
UPDATE "Asset" SET "category" = CASE
  WHEN "type" = 'CASH' THEN 'CASH'::"AssetCategory"
  WHEN "type" = 'BANK' THEN 'BANK'::"AssetCategory"
  WHEN "type" = 'CREDIT' THEN 'CREDIT'::"AssetCategory"
  WHEN "type" = 'LOAN' THEN 'LOAN'::"AssetCategory"
  WHEN "type" = 'INVESTMENT' THEN 'INVESTMENT'::"AssetCategory"
  ELSE 'BANK'::"AssetCategory" -- fallback for anything unmapped
END;

-- Step 3: now every row has a value, safe to enforce NOT NULL
ALTER TABLE "Asset" ALTER COLUMN "category" SET NOT NULL;

-- Step 4: now safe to drop the old columns, add the rest, and alter balance
ALTER TABLE "Asset" DROP COLUMN "creditLimit",
DROP COLUMN "isActive",
DROP COLUMN "type",
ADD COLUMN     "includeInNetWorth" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "institution" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "subtype" "AssetSubtype",
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(20,8);

-- Recreate the userId index, plus the composite one from the schema
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");
CREATE INDEX "Asset_userId_category_idx" ON "Asset"("userId", "category");

-- CreateTable
CREATE TABLE "LoanDetail" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "originalPrincipal" DECIMAL(20,2) NOT NULL,
    "interestRate" DECIMAL(6,4) NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "minimumPayment" DECIMAL(20,2) NOT NULL,
    "nextDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditDetail" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "creditLimit" DECIMAL(20,2) NOT NULL,
    "statementDate" INTEGER,
    "dueDate" INTEGER,
    "minimumPayment" DECIMAL(20,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentPosition" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "averageCostBasis" DECIMAL(20,8) NOT NULL,
    "valuationCurrency" TEXT NOT NULL DEFAULT 'USD',
    "lastPrice" DECIMAL(20,8),
    "lastPriceAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanDetail_assetId_key" ON "LoanDetail"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditDetail_assetId_key" ON "CreditDetail"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentPosition_assetId_key" ON "InvestmentPosition"("assetId");

-- AddForeignKey
ALTER TABLE "LoanDetail" ADD CONSTRAINT "LoanDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditDetail" ADD CONSTRAINT "CreditDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentPosition" ADD CONSTRAINT "InvestmentPosition_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;