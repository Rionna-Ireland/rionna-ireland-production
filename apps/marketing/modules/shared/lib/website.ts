import "server-only";
import { cache } from "react";

import { getClubHorses, getClubOrganization } from "./club";
import { getJoinCta, type JoinCta } from "./join-url";
import { normalizeWebsite, pickFeaturedHorses } from "./website-normalize";

export * from "./website-normalize";

export const getWebsiteContent = cache(async () => {
	const [org, horses] = await Promise.all([getClubOrganization(), getClubHorses()]);
	const content = normalizeWebsite(org.metadata?.website);
	return { content, featuredHorses: pickFeaturedHorses(horses, content.featuredHorseIds) };
});

/** Join CTA for the site chrome; reads only org metadata so a horse-query failure can't break it. */
export const getSiteJoinCta = cache(
	async (): Promise<JoinCta> =>
		getJoinCta({
			joinMode: normalizeWebsite((await getClubOrganization()).metadata?.website).joinMode,
		}),
);
