import { fileURLToPath } from "node:url";

// @ts-expect-error - PrismaPlugin is not typed
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import type { NextConfig } from "next";
import nextIntlPlugin from "next-intl/plugin";

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const nextConfig: NextConfig = {
	outputFileTracingRoot: repoRoot,
	turbopack: {
		root: repoRoot,
	},
	transpilePackages: ["@repo/api", "@repo/auth", "@repo/database", "@repo/ui"],
	images: {
		remotePatterns: [
			{
				// google profile images
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				// github profile images
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				// Supabase Storage — horse/news/brand images (public bucket, D14), all envs
				protocol: "https",
				hostname: "*.supabase.co",
			},
			{
				// seed / dev placeholder images
				protocol: "https",
				hostname: "picsum.photos",
			},
		],
	},
	async redirects() {
		return [
			{
				source: "/settings",
				destination: "/settings/general",
				permanent: true,
			},
			{
				source: "/:organizationSlug/settings",
				destination: "/:organizationSlug/settings/general",
				permanent: true,
			},
			// NOTE: no `/admin` → `/admin/users` redirect. `/admin` is the Mission
			// Control landing page (S2-09 surface A); redirecting it away shadowed
			// the dashboard entirely.
			{
				// S2-13: `/admin/users` merged into the unified members roster.
				// `permanent: false` (307) on purpose — a `permanent: true` 308 gets
				// hard-cached in-browser, which has bitten this project before.
				source: "/admin/users",
				destination: "/admin/members",
				permanent: false,
			},
		];
	},
	webpack: (config, { webpack, isServer }) => {
		config.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /^pg-native$|^cloudflare:sockets$/,
			}),
		);

		if (isServer) {
			config.plugins.push(new PrismaPlugin());
		}

		return config;
	},
};

export default withNextIntl(nextConfig);
