-- S8-01 §6: HorseWellbeingUpdate — admin-authored, member-read timeline
-- entries (vet notes, training progress, rehab/rest). Curated club content
-- (not community-generated), same footing as NewsPost/MemberPost under D10.

-- CreateEnum
CREATE TYPE "HorseWellbeingType" AS ENUM ('VET', 'TRAINING', 'REHAB', 'REST');

-- CreateTable
CREATE TABLE "horse_wellbeing_update" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "HorseWellbeingType" NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "notifyMembers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "horse_wellbeing_update_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "horse_wellbeing_update_horseId_publishedAt_idx" ON "horse_wellbeing_update"("horseId", "publishedAt");

-- CreateIndex
CREATE INDEX "horse_wellbeing_update_organizationId_idx" ON "horse_wellbeing_update"("organizationId");

-- AddForeignKey
ALTER TABLE "horse_wellbeing_update" ADD CONSTRAINT "horse_wellbeing_update_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "horse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horse_wellbeing_update" ADD CONSTRAINT "horse_wellbeing_update_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth: enable RLS on this new public table (no policies → fail-closed
-- for the Supabase Data API roles). Prisma connects as `postgres` (rolbypassrls),
-- so this is transparent to the app. Required for every new table per
-- 20260618120000_enable_rls_public_tables.
ALTER TABLE "horse_wellbeing_update" ENABLE ROW LEVEL SECURITY;
