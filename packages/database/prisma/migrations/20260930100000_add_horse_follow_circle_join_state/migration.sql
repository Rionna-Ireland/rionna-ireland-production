-- S8-04 incremental reconcile: track per-follow Circle join state so the
-- daily reconcile only retries follows that have never joined successfully.
-- Existing rows start as NULL, so the first run after deploy re-asserts every
-- follow once (and stamps each success), after which runs are near-empty.
ALTER TABLE "horse_follow" ADD COLUMN "circleJoinedAt" TIMESTAMP(3);
ALTER TABLE "horse_follow" ADD COLUMN "circleJoinAttempts" INTEGER NOT NULL DEFAULT 0;
