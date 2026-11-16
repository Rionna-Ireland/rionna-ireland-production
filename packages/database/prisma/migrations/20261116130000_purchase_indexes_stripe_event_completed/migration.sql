-- S17-02 (W-08): mark a Stripe event finished so a stuck claim can be re-taken.
ALTER TABLE "stripe_event_log" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Claims made before this column existed were already processed.
UPDATE "stripe_event_log" SET "completedAt" = "processedAt";

-- S17-02 (W-19): purchase lookups by user and by org + status; subscriptionId is already @unique.
DROP INDEX "purchase_subscriptionId_idx";
CREATE INDEX "purchase_userId_idx" ON "purchase"("userId");
CREATE INDEX "purchase_organizationId_status_idx" ON "purchase"("organizationId", "status");
