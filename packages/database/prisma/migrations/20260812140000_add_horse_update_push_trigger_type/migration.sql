-- AlterEnum: extend PushTriggerType with the shared horse-update category
-- (S8-01a3 — replaces the wellbeing-only HORSE_WELLBEING push with one
-- trigger covering all four admin-authored horse update types). Kept as its
-- own migration — Postgres forbids using a newly-added enum value inside the
-- transaction that added it (S6-01 T10 pattern). HORSE_WELLBEING is left in
-- place as a legacy value — Postgres can't drop enum values.
ALTER TYPE "PushTriggerType" ADD VALUE 'HORSE_UPDATE';
