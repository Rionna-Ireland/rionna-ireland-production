import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Fall back to the monorepo-root dev/staging env files (`.env.local`, then `.env`)
// ONLY when no connection URL has already been injected — e.g. a bare
// `prisma generate`, or `prisma studio` run without the dotenv wrapper.
//
// When a deploy script HAS injected an env file (`migrate:staging` →
// `.env.staging`, `migrate:production` → `.env.production`), we must NOT load
// these files: they point at STAGING, and dotenv's no-override semantics mean
// they'd silently fill any gap in a partial target env — so a `.env.production`
// missing `DIRECT_URL` would quietly resolve to the staging database. Guarding
// on both vars means any injected connection info disables this fallback
// entirely, so a misconfigured prod deploy fails loudly on the prod project
// instead of silently succeeding against staging.
//
// Vercel injects env vars directly (no files), so this is a no-op there too.
if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
	config({ path: "../../.env.local" });
	config({ path: "../../.env" });
}

export default defineConfig({
	schema: "./prisma/schema.prisma",
	datasource: {
		// CLI operations (migrate/push/studio) must use the session pooler —
		// transaction-mode PgBouncer (6543) breaks advisory locks & multi-statement DDL.
		// The runtime client (prisma/client.ts) independently uses DATABASE_URL.
		url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
	},
});
