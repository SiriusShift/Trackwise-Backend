-- AlterTable
ALTER TABLE "users" ALTER COLUMN "isActive" SET DEFAULT true;

-- CreateTable
CREATE TABLE "Transfer" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "fromAssetId" INTEGER NOT NULL,
    "toAssetId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAssetId_fkey" FOREIGN KEY ("fromAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAssetId_fkey" FOREIGN KEY ("toAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
