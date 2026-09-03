-- S12-01 §1: impact stories are news posts tagged category = 'charity'.
-- Additive nullable column only; RLS on news_post is unchanged.

-- AlterTable
ALTER TABLE "news_post" ADD COLUMN "category" TEXT;

-- CreateIndex
CREATE INDEX "news_post_organizationId_category_publishedAt_idx" ON "news_post"("organizationId", "category", "publishedAt");
