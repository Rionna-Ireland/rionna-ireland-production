-- S12-08: at most one OPEN "member needs attention" item per member. Escalation
-- relies on the unique violation (P2002 → createModerationFlag returns null) so
-- concurrent blocks can't double-email admins.
CREATE UNIQUE INDEX "moderation_flag_attention_open_key" ON "moderation_flag"("organizationId", "memberId")
  WHERE "source" = 'attention' AND "status" = 'open';
