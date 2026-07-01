-- S6-07: horse Circle space visibility (open-space access model)
ALTER TABLE "horse"
  ADD COLUMN "circleSpaceVisibility" TEXT DEFAULT 'private';
