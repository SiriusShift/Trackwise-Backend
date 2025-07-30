-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "timeFormat" TEXT NOT NULL DEFAULT 'hh:mm A',

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
