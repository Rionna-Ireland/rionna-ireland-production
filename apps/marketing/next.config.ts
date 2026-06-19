import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: resolve(__dirname, "../../.env.local"), override: false });
loadEnv({ path: resolve(__dirname, "../../.env"), override: false });

import { withContentCollections } from "@content-collections/next";
import type { NextConfig } from "next";
import nextIntlPlugin from "next-intl/plugin";

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");

const nextConfig: NextConfig = {
	transpilePackages: ["@repo/i18n", "@repo/ui"],
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "placehold.co",
			},
			{
				protocol: "https",
				hostname: "picsum.photos",
			},
			{
				// Supabase Storage — public horse/news/brand images (public bucket, D14/D35)
				protocol: "https",
				hostname: "*.supabase.co",
			},
		],
	},
};

export default withContentCollections(withNextIntl(nextConfig));
