-- S13-19: pinned expert answer, comment attribution, expert label
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXPERT_ANSWER';

ALTER TABLE "user" ADD COLUMN "expertLabel" TEXT;

CREATE TABLE "comment_attribution" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "circleCommentId" TEXT NOT NULL,
  "trainerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_attribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "comment_attribution_circleCommentId_key" ON "comment_attribution"("circleCommentId");
CREATE INDEX "comment_attribution_organizationId_idx" ON "comment_attribution"("organizationId");
CREATE INDEX "comment_attribution_trainerId_idx" ON "comment_attribution"("trainerId");
ALTER TABLE "comment_attribution" ADD CONSTRAINT "comment_attribution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_attribution" ADD CONSTRAINT "comment_attribution_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_attribution" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "pinned_answer" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "circlePostId" TEXT NOT NULL,
  "circleCommentId" TEXT NOT NULL,
  "pinnedByUserId" TEXT NOT NULL,
  "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pinned_answer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pinned_answer_circlePostId_key" ON "pinned_answer"("circlePostId");
CREATE INDEX "pinned_answer_organizationId_idx" ON "pinned_answer"("organizationId");
ALTER TABLE "pinned_answer" ADD CONSTRAINT "pinned_answer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pinned_answer" ENABLE ROW LEVEL SECURITY;
