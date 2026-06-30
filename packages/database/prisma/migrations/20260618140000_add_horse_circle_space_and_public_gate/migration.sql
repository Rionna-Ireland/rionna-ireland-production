-- AlterTable: Horse — Circle space auto-provisioning lifecycle + public visibility gate (S2-09 surface F)
ALTER TABLE "horse" ADD COLUMN "circleSpaceStatus" TEXT;
ALTER TABLE "horse" ADD COLUMN "circleSpaceProvisionedAt" TIMESTAMP(3);
ALTER TABLE "horse" ADD COLUMN "publicProfileAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "horse_organizationId_publicProfileAt_idx" ON "horse"("organizationId", "publicProfileAt");
