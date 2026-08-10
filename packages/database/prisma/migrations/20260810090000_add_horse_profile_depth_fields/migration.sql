-- S8-01 §5/§6: Horse Profile depth — long-form story, audio notes, replay links.

-- AlterTable: Horse — long-form story field (separate from `bio`) and an
-- audio-notes array parallel to `photos` (same {url, caption} shape).
ALTER TABLE "horse" ADD COLUMN "story" TEXT;
ALTER TABLE "horse" ADD COLUMN "audioNotes" JSONB NOT NULL DEFAULT '[]';

-- AlterTable: RaceEntry — replay link surfaced on declarations/results.
ALTER TABLE "race_entry" ADD COLUMN "replayUrl" TEXT;
