-- S8-01a2: drop the standalone HorseWellbeingUpdate timeline — wellbeing
-- content is consolidated onto the existing "Horse updates" feature
-- (MemberPost, audienceType "horse", updateType "wellbeing"). This DROP is
-- written to succeed whether or not 20260812100000 (which added
-- `circlePostId`) has been applied to a given environment.

-- DropTable
DROP TABLE IF EXISTS "horse_wellbeing_update" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "HorseWellbeingType";
