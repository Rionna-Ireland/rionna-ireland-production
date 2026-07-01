-- CreateTable
CREATE TABLE "horse_follow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horse_follow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "horse_follow_userId_horseId_key" ON "horse_follow"("userId", "horseId");

-- CreateIndex
CREATE INDEX "horse_follow_horseId_idx" ON "horse_follow"("horseId");

-- CreateIndex
CREATE INDEX "horse_follow_organizationId_userId_idx" ON "horse_follow"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "horse_follow" ADD CONSTRAINT "horse_follow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horse_follow" ADD CONSTRAINT "horse_follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horse_follow" ADD CONSTRAINT "horse_follow_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "horse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth: enable RLS on this new public table (no policies → fail-closed
-- for the Supabase Data API roles). Prisma connects as `postgres` (rolbypassrls),
-- so this is transparent to the app. Required for every new table per
-- 20260618120000_enable_rls_public_tables.
ALTER TABLE "horse_follow" ENABLE ROW LEVEL SECURITY;
