import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load from monorepo root — silent if file doesn't exist (Vercel injects env vars directly)
config({ path: "../../.env.local" });
config({ path: "../../.env" });

export default defineConfig({
	schema: "./prisma/schema.prisma",
	datasource: {
		// CLI operations (migrate/push/studio) must use the session pooler —
		// transaction-mode PgBouncer (6543) breaks advisory locks & multi-statement DDL.
		// The runtime client (prisma/client.ts) independently uses DATABASE_URL.
		url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
	},
});
