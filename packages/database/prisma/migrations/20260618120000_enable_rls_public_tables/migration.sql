-- Defense-in-depth: enable Row Level Security on every table in `public`.
--
-- Why this exists, given the app never uses the Supabase Data API / PostgREST:
--   * The Data API exposes the `public` schema with the `anon` / `authenticated`
--     roles. Those roles currently have no table privileges (Prisma created the
--     tables as `postgres`, bypassing Supabase's default grants), so the tables
--     are not reachable today. That protection is implicit and fragile — a single
--     stray GRANT would silently open it.
--   * Enabling RLS with NO policies makes the deny explicit and durable: the
--     Data API roles get zero rows (fail-closed), independent of grants.
--
-- Why this is safe for the app:
--   Prisma connects as `postgres`, which has rolbypassrls = true, so RLS is
--   completely transparent to all application queries. (Verified before applying.)
--
-- NOTE: this enables RLS on the tables that exist at apply time. Any NEW table
-- added by a future migration must also have RLS enabled — keep this in mind
-- when adding models, or add an event trigger to automate it.

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;
