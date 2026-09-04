-- S12-02a: member-created posts + moderation flags (blocks and reports)
CREATE TABLE "community_post" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "circlePostId" TEXT NOT NULL,
  "circleSpaceId" TEXT NOT NULL,
  "title" TEXT,
  "excerpt" TEXT NOT NULL,
  "hasImage" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedBy" TEXT,
  CONSTRAINT "community_post_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "community_post_circlePostId_key" ON "community_post"("circlePostId");
CREATE INDEX "community_post_organizationId_memberId_createdAt_idx" ON "community_post"("organizationId", "memberId", "createdAt");
CREATE INDEX "community_post_organizationId_createdAt_idx" ON "community_post"("organizationId", "createdAt");
ALTER TABLE "community_post" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "moderation_flag" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "surface" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "targetPostId" TEXT,
  "targetCommentId" TEXT,
  "targetSpaceId" TEXT,
  "targetAuthorName" TEXT,
  "contentExcerpt" TEXT NOT NULL,
  "matchedTerms" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "reason" TEXT,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "resolvedAt" TIMESTAMP(3),
  "resolvedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_flag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "moderation_flag_organizationId_source_status_createdAt_idx" ON "moderation_flag"("organizationId", "source", "status", "createdAt");
-- One report per member per item (Decision 14). Partial so blocked rows and comment/post rows don't collide.
CREATE UNIQUE INDEX "moderation_flag_report_post_key" ON "moderation_flag"("organizationId", "memberId", "targetPostId")
  WHERE "source" = 'reported' AND "surface" = 'post';
CREATE UNIQUE INDEX "moderation_flag_report_comment_key" ON "moderation_flag"("organizationId", "memberId", "targetCommentId")
  WHERE "source" = 'reported' AND "surface" = 'comment';
ALTER TABLE "moderation_flag" ENABLE ROW LEVEL SECURITY;
