import "server-only";
import {
	getOrganizationBySlug,
	getPublicHorses,
	getPublishedNewsPosts,
	getPublishedNewsPostBySlug,
	type OrganizationMetadata,
	parseOrgMetadata,
} from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
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
		metadata: parseOrgMetadata(typeof org.metadata === "string" ? org.metadata : null),
	};
});

// Public marketing site uses the publicProfileAt gate (S2-09 surface F) — a
// horse can be live for members (publishedAt) while its public reveal is held.
export const getClubHorses = cache(async () => {
	const org = await getClubOrganization();
	if (!org.id) return [];
	return getPublicHorses(org.id);
});

export const getClubNewsPosts = cache(async (opts: { limit?: number; cursor?: string } = {}) => {
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
});

export const getClubNewsPostBySlug = cache(async (slug: string) => {
	const org = await getClubOrganization();
	if (!org.id) return null;
	return getPublishedNewsPostBySlug(org.id, slug);
});

export interface PublicClubEvent {
	id: string;
	name: string;
	startsAt: string | null;
	endsAt: string | null;
	coverImageUrl: string | null;
	excerpt: string | null;
}

/**
 * Upcoming club events for the public marketing calendar (S11-02, D32).
 * Server-side Admin API read — no member context. Deliberately excludes
 * location: precise whereabouts are a member privilege ("join to see
 * details"). Fail-open to [] — the marketing page must never break on
 * Circle problems.
 */
export const getClubEvents = cache(
	async ({ limit = 12 }: { limit?: number } = {}): Promise<{ items: PublicClubEvent[] }> => {
		try {
			const org = await getClubOrganization();
			if (!org.id) return { items: [] };

			const eventsSpaceId = org.metadata.circle?.eventsSpaceId;
			if (!eventsSpaceId) return { items: [] };

			const circle = createCircleService(org.slug);
			// startDateFrom keeps page 1 genuinely upcoming instead of truncating
			// on old events past the 60-event page cap (S11-02 fix); the
			// endsAt/startsAt >= now filter below stays as belt-and-braces.
			const startDateFrom = new Date().toISOString().slice(0, 10);
			const outcome = await circle.listEvents({
				spaceId: eventsSpaceId,
				sort: "start_date",
				startDateFrom,
			});
			if (!outcome.ok) return { items: [] };

			const now = Date.now();
			const items = outcome.data.events
				.filter((event) => {
					const end = event.endsAt ?? event.startsAt;
					return end !== null && new Date(end).getTime() >= now;
				})
				.slice(0, limit)
				.map((event) => ({
					id: event.circleEventId,
					name: event.name,
					startsAt: event.startsAt,
					endsAt: event.endsAt,
					coverImageUrl: event.coverImageUrl,
					excerpt: null,
				}));

			return { items };
		} catch {
			return { items: [] };
		}
	},
);
