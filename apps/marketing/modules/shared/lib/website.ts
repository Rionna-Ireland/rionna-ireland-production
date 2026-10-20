import "server-only";
import { cache } from "react";

import { getClubHorses, getClubOrganization } from "./club";
import { normalizeWebsite, pickFeaturedHorses } from "./website-normalize";

export * from "./website-normalize";

export const getWebsiteContent = cache(async () => {
	const [org, horses] = await Promise.all([getClubOrganization(), getClubHorses()]);
	const content = normalizeWebsite(org.metadata.website);
	return { content, featuredHorses: pickFeaturedHorses(horses, content.featuredHorseIds) };
});
