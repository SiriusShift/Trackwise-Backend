-- CreateTable
CREATE TABLE "SavingDetail" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "targetAmount" DECIMAL(20,2) NOT NULL,
    "targetDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_sessions" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavingDetail_assetId_key" ON "SavingDetail"("assetId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions"("expire");

-- AddForeignKey
ALTER TABLE "SavingDetail" ADD CONSTRAINT "SavingDetail_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
