-- S8-01 Amendment A1: cross-post wellbeing updates into the horse's Circle
-- space. `circlePostId` is a denormalized snapshot of the resulting Circle
-- post id (DB stays the source of truth; Circle is a projection — same
-- pattern as HorseFollow -> space membership, S8-04). Additive column only;
-- RLS on horse_wellbeing_update is unchanged.

-- AlterTable
ALTER TABLE "horse_wellbeing_update" ADD COLUMN "circlePostId" TEXT;
