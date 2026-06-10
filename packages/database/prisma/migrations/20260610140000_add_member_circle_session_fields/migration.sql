-- AlterTable
ALTER TABLE "member" ADD COLUMN     "circleRefreshToken" TEXT;
ALTER TABLE "member" ADD COLUMN     "circleProfileConfirmedAt" TIMESTAMP(3);
