-- CreateTable
CREATE TABLE "member_post" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "audienceType" TEXT NOT NULL,
    "horseId" TEXT,
    "updateType" TEXT,
    "title" TEXT NOT NULL,
    "bodyJson" JSONB NOT NULL DEFAULT '{}',
    "bodyHtml" TEXT,
    "videoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "circleSpaceId" TEXT,
    "circlePostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_post_organizationId_status_idx" ON "member_post"("organizationId", "status");

-- CreateIndex
CREATE INDEX "member_post_organizationId_publishedAt_idx" ON "member_post"("organizationId", "publishedAt");

-- CreateIndex
CREATE INDEX "member_post_horseId_idx" ON "member_post"("horseId");

-- AddForeignKey
ALTER TABLE "member_post" ADD CONSTRAINT "member_post_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_post" ADD CONSTRAINT "member_post_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_post" ADD CONSTRAINT "member_post_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "horse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense-in-depth: enable RLS on this new public table (no policies → fail-closed
-- for the Supabase Data API roles). Prisma connects as `postgres` (rolbypassrls),
-- so this is transparent to the app. Required for every new table per
-- 20260618120000_enable_rls_public_tables.
ALTER TABLE "member_post" ENABLE ROW LEVEL SECURITY;
