-- CreateTable
CREATE TABLE "poll" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "question" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'club',
    "circleSpaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "poll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "poll_option" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "poll_option_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "poll_vote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "poll_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "poll_organizationId_status_idx" ON "poll"("organizationId", "status");
CREATE INDEX "poll_organizationId_publishedAt_idx" ON "poll"("organizationId", "publishedAt");
CREATE INDEX "poll_option_pollId_idx" ON "poll_option"("pollId");
CREATE UNIQUE INDEX "poll_vote_pollId_userId_key" ON "poll_vote"("pollId", "userId");
CREATE INDEX "poll_vote_optionId_idx" ON "poll_vote"("optionId");

-- AddForeignKey
ALTER TABLE "poll" ADD CONSTRAINT "poll_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll" ADD CONSTRAINT "poll_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "poll_option" ADD CONSTRAINT "poll_option_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "poll_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth: enable RLS on these new public tables (no policies → fail-closed
-- for the Supabase Data API roles). Prisma connects as `postgres` (rolbypassrls),
-- so this is transparent to the app. Required for every new table per
-- 20260618120000_enable_rls_public_tables.
ALTER TABLE "poll" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "poll_option" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "poll_vote" ENABLE ROW LEVEL SECURITY;
