-- S13-12: founding member flag (first 25 non-staff paying members; admin-editable)
ALTER TABLE "member" ADD COLUMN "foundingMember" BOOLEAN NOT NULL DEFAULT false;
