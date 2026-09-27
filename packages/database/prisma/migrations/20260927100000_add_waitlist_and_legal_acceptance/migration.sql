-- S12-09: pre-launch waitlist (single opt-in)
CREATE TABLE "waitlist_signup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'subscribed',
  "source" TEXT,
  "consentVersion" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "unsubscribeToken" TEXT NOT NULL,
  "unsubscribedAt" TIMESTAMP(3),
  "launchEmailSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "waitlist_signup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "waitlist_signup_unsubscribeToken_key" ON "waitlist_signup"("unsubscribeToken");
CREATE UNIQUE INDEX "waitlist_signup_organizationId_email_key" ON "waitlist_signup"("organizationId", "email");
ALTER TABLE "waitlist_signup" ADD CONSTRAINT "waitlist_signup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "waitlist_signup" ENABLE ROW LEVEL SECURITY;

-- S12-10: legal document acceptance evidence (append-only)
CREATE TABLE "legal_acceptance" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "document" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_acceptance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "legal_acceptance_organizationId_document_userId_acceptedAt_idx" ON "legal_acceptance"("organizationId", "document", "userId", "acceptedAt");
ALTER TABLE "legal_acceptance" ADD CONSTRAINT "legal_acceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_acceptance" ADD CONSTRAINT "legal_acceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_acceptance" ENABLE ROW LEVEL SECURITY;
