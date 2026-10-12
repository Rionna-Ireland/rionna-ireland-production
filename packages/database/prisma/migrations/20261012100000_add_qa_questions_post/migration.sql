-- S13-11: companion "questions" Circle post for QA events (members comment their questions)
ALTER TABLE "club_event_meta" ADD COLUMN "questionsPostId" TEXT;
ALTER TABLE "club_event_meta" ADD COLUMN "questionsSpaceId" TEXT;
