-- S12-01 Paddock build: partner offer catalogue + charity config (one current row per org,
-- history kept via endedAt). Money is integer cents; percentage is DECIMAL(5,2).

-- CreateTable
CREATE TABLE "partner_offer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "discountCode" TEXT,
    "redeemUrl" TEXT,
    "howToRedeem" TEXT,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charity_config" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "charityName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "percentage" DECIMAL(5,2) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "goalCents" INTEGER,
    "manualOverrideCents" INTEGER,
    "pollId" TEXT,
    "stripeRevenueCents" INTEGER NOT NULL DEFAULT 0,
    "revenueSyncedAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "charity_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_offer_organizationId_active_sortOrder_idx" ON "partner_offer"("organizationId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "charity_config_organizationId_endedAt_idx" ON "charity_config"("organizationId", "endedAt");

-- AddForeignKey
ALTER TABLE "partner_offer" ADD CONSTRAINT "partner_offer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charity_config" ADD CONSTRAINT "charity_config_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-in-depth: enable RLS on these new public tables (no policies → fail-closed
-- for the Supabase Data API roles). Prisma connects as `postgres` (rolbypassrls),
-- so this is transparent to the app. Required for every new table per
-- 20260618120000_enable_rls_public_tables.
ALTER TABLE "partner_offer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "charity_config" ENABLE ROW LEVEL SECURITY;
