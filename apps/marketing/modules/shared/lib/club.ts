import "server-only";

import {
	getOrganizationBySlug,
	getPublishedHorses,
	getPublishedNewsPosts,
	getPublishedNewsPostBySlug,
	type OrganizationMetadata,
	parseOrgMetadata,
} from "@repo/database";
import { cache } from "react";

const DEFAULT_CLUB_SLUG = "rionna";

export type ClubOrganization = {
	id: string;
	name: string;
	slug: string;
	metadata: OrganizationMetadata;
};

export const getClubOrganization = cache(async (): Promise<ClubOrganization> => {
	const slug = process.env.CLUB_ORGANIZATION_SLUG ?? DEFAULT_CLUB_SLUG;
	const org = await getOrganizationBySlug(slug).catch(() => null);

	if (!org) {
		return {
			id: "",
			name: "Rionna",
			slug,
			metadata: {},
		};
	}

	return {
		id: org.id,
		name: org.name,
		slug: org.slug ?? slug,
		metadata: parseOrgMetadata(
			typeof org.metadata === "string" ? org.metadata : null,
		),
	};
});

export const getClubHorses = cache(async () => {
	const org = await getClubOrganization();
	if (!org.id) return [];
	return getPublishedHorses(org.id);
});

export const getClubNewsPosts = cache(
	async (opts: { limit?: number; cursor?: string } = {}) => {
		const org = await getClubOrganization();
		if (!org.id) return { items: [], nextCursor: undefined as string | undefined };

		const limit = opts.limit ?? 12;
		const posts = await getPublishedNewsPosts({
			organizationId: org.id,
			limit,
			cursor: opts.cursor,
		});

		const hasMore = posts.length > limit;
		const items = hasMore ? posts.slice(0, limit) : posts;
		const nextCursor = hasMore ? items[items.length - 1]?.id : undefined;

		return { items, nextCursor };
	},
);

export const getClubNewsPostBySlug = cache(async (slug: string) => {
	const org = await getClubOrganization();
	if (!org.id) return null;
	return getPublishedNewsPostBySlug(org.id, slug);
});
