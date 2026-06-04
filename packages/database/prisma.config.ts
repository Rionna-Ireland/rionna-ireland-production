import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load from monorepo root — silent if file doesn't exist (Vercel injects env vars directly)
config({ path: "../../.env.local" });
config({ path: "../../.env" });

export default defineConfig({
	schema: "./prisma/schema.prisma",
	datasource: {
		url: process.env.DATABASE_URL!,
	},
});
