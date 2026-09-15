-- S12-06a: notification centre inbox
ALTER TYPE "PushTriggerType" ADD VALUE IF NOT EXISTS 'COMMUNITY_COMMENT';

ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "inboxUnseenCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "inbox_item" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "imageUrl" TEXT,
  "actorUserId" TEXT,
  "actorName" TEXT,
  "actorCount" INTEGER NOT NULL DEFAULT 1,
  "data" JSONB NOT NULL,
  "refId" TEXT,
  "readAt" TIMESTAMP(3),
  "lastPushedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inbox_item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inbox_item_userId_groupKey_key" ON "inbox_item"("userId", "groupKey");
CREATE INDEX "inbox_item_userId_organizationId_updatedAt_id_idx" ON "inbox_item"("userId", "organizationId", "updatedAt" DESC, "id");
CREATE INDEX "inbox_item_updatedAt_idx" ON "inbox_item"("updatedAt");
ALTER TABLE "inbox_item" ADD CONSTRAINT "inbox_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbox_item" ENABLE ROW LEVEL SECURITY;
