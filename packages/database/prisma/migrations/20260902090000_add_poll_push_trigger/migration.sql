-- AlterEnum: extend PushTriggerType with the POLL trigger (S12-01a). Own
-- migration — Postgres forbids using a newly-added enum value inside the
-- transaction that added it (S6-01 T10 pattern).
ALTER TYPE "PushTriggerType" ADD VALUE 'POLL';
