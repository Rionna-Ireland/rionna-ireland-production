-- S13-10 Phase A: horse facts, trainer location, race entry field size
CREATE TYPE "HorseSex" AS ENUM ('FILLY', 'COLT', 'MARE', 'GELDING', 'STALLION');

ALTER TABLE "horse" ADD COLUMN "colour" TEXT;
ALTER TABLE "horse" ADD COLUMN "sex" "HorseSex";
ALTER TABLE "horse" ADD COLUMN "foaledOn" DATE;
ALTER TABLE "horse" ADD COLUMN "foaledPlace" TEXT;
ALTER TABLE "horse" ADD COLUMN "foaledCountry" TEXT;

ALTER TABLE "trainer" ADD COLUMN "location" TEXT;

ALTER TABLE "race_entry" ADD COLUMN "fieldSize" INTEGER;

-- S13-10 Phase B: structured wellbeing (one row per horse)
CREATE TYPE "VetCheckStatus" AS ENUM ('ALL_CLEAR', 'MONITORING', 'TREATMENT');
CREATE TYPE "TrainingLoad" AS ENUM ('RESTING', 'LIGHT', 'BUILDING', 'FULL');

CREATE TABLE "horse_wellbeing" (
  "id" TEXT NOT NULL,
  "horseId" TEXT NOT NULL,
  "vetCheckStatus" "VetCheckStatus",
  "vetCheckedAt" TIMESTAMP(3),
  "trainingLoad" "TrainingLoad",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "horse_wellbeing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "horse_wellbeing_horseId_key" ON "horse_wellbeing"("horseId");
ALTER TABLE "horse_wellbeing" ADD CONSTRAINT "horse_wellbeing_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "horse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "horse_wellbeing" ENABLE ROW LEVEL SECURITY;
