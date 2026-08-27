-- AlterEnum: extend PushTriggerType with the Inside Track educational-content
-- category (S11-01). Kept as its own migration — Postgres forbids using a
-- newly-added enum value inside the transaction that added it (S6-01 T10
-- pattern).
ALTER TYPE "PushTriggerType" ADD VALUE 'INSIDE_TRACK';
