import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
	esbuild: { jsx: "automatic" },
	test: {
		globals: true,
		environment: "node",
		exclude: ["**/node_modules/**", "**/tests/**", "**/.next/**"],
	},
	resolve: {
		alias: {
			"@config": path.resolve(import.meta.dirname, "./config"),
			"@analytics": path.resolve(import.meta.dirname, "./modules/analytics"),
			"@home": path.resolve(import.meta.dirname, "./modules/home"),
			"@about": path.resolve(import.meta.dirname, "./modules/about"),
			"@events": path.resolve(import.meta.dirname, "./modules/events"),
			"@news": path.resolve(import.meta.dirname, "./modules/news"),
			"@blog": path.resolve(import.meta.dirname, "./modules/blog"),
			"@i18n": path.resolve(import.meta.dirname, "./modules/i18n"),
			"@changelog": path.resolve(import.meta.dirname, "./modules/changelog"),
			"@legal": path.resolve(import.meta.dirname, "./modules/legal"),
			"@shared": path.resolve(import.meta.dirname, "./modules/shared"),
			"@waitlist": path.resolve(import.meta.dirname, "./modules/waitlist"),
			"content-collections": path.resolve(
				import.meta.dirname,
				"./.content-collections/generated",
			),
		},
	},
});
