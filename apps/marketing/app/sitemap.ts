import { config as i18nConfig } from "@i18n/config";
import { getBaseUrl } from "@shared/lib/base-url";
import { getUniqueBasePaths } from "@shared/lib/content";
import { allLegalPages } from "content-collections";
import type { MetadataRoute } from "next";

const baseUrl = getBaseUrl();
const locales = Object.keys(i18nConfig.locales);
const defaultLocale = i18nConfig.defaultLocale;

function localePath(locale: string, path: string): string {
	const prefix = locale === defaultLocale ? "" : `/${locale}`;
	return `${prefix}${path}`;
}

// S12-09: /waitlist is the shareable pre-launch page. There are no /blog or
// /changelog routes any more, so neither they nor blog posts are listed.
const staticMarketingPages = ["", "/waitlist"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const legalPaths = getUniqueBasePaths(allLegalPages);

	return [
		...staticMarketingPages.flatMap((page) =>
			locales.map((locale) => ({
				url: new URL(localePath(locale, page), baseUrl).href,
				lastModified: new Date(),
			})),
		),
		...legalPaths.flatMap((path) =>
			locales.map((locale) => ({
				url: new URL(localePath(locale, `/legal/${path}`), baseUrl).href,
				lastModified: new Date(),
			})),
		),
	];
}
