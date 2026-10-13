-- S13-13: admin-entered Inside Track video length (overrides the parsed value)
CREATE TABLE "inside_track_meta" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "circlePostId" TEXT NOT NULL,
  "videoDurationSeconds" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inside_track_meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inside_track_meta_circlePostId_key" ON "inside_track_meta"("circlePostId");
CREATE INDEX "inside_track_meta_organizationId_idx" ON "inside_track_meta"("organizationId");
ALTER TABLE "inside_track_meta" ADD CONSTRAINT "inside_track_meta_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inside_track_meta" ENABLE ROW LEVEL SECURITY;
