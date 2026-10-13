-- S13-17: ledger for the staging showcase seed/wipe
CREATE TABLE "seed_ledger" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seed_ledger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "seed_ledger_kind_externalId_key" ON "seed_ledger"("kind", "externalId");
CREATE INDEX "seed_ledger_kind_idx" ON "seed_ledger"("kind");
ALTER TABLE "seed_ledger" ENABLE ROW LEVEL SECURITY;
