-- AlterEnum: extend PushTriggerType with the wellbeing-update category (S8-01
-- §3/§6, S6-01 T10 pattern). Kept as its own migration — Postgres forbids
-- using a newly-added enum value inside the transaction that added it.
ALTER TYPE "PushTriggerType" ADD VALUE 'HORSE_WELLBEING';
