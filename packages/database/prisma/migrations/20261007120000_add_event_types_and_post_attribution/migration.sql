-- S13-11: event types, trainer account link, post attribution
CREATE TYPE "EventType" AS ENUM ('RACE_DAY', 'STABLE_VISIT', 'SOCIAL', 'QA', 'OTHER');

ALTER TABLE "trainer" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "trainer_userId_key" ON "trainer"("userId");
ALTER TABLE "trainer" ADD CONSTRAINT "trainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "club_event_meta" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "circleEventId" TEXT NOT NULL,
  "type" "EventType" NOT NULL DEFAULT 'OTHER',
  "startsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "club_event_meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "club_event_meta_circleEventId_key" ON "club_event_meta"("circleEventId");
CREATE INDEX "club_event_meta_organizationId_type_idx" ON "club_event_meta"("organizationId", "type");
ALTER TABLE "club_event_meta" ADD CONSTRAINT "club_event_meta_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_event_meta" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "post_attribution" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "circlePostId" TEXT NOT NULL,
  "trainerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_attribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "post_attribution_circlePostId_key" ON "post_attribution"("circlePostId");
CREATE INDEX "post_attribution_organizationId_idx" ON "post_attribution"("organizationId");
CREATE INDEX "post_attribution_trainerId_idx" ON "post_attribution"("trainerId");
ALTER TABLE "post_attribution" ADD CONSTRAINT "post_attribution_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_attribution" ADD CONSTRAINT "post_attribution_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_attribution" ENABLE ROW LEVEL SECURITY;
