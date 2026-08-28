-- AlterEnum: extend PushTriggerType with the EVENT_PUBLISHED trigger
-- (S11-02). Kept as its own migration — Postgres forbids using a newly-added
-- enum value inside the transaction that added it (S6-01 T10 pattern).
ALTER TYPE "PushTriggerType" ADD VALUE 'EVENT_PUBLISHED';
