import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { type MemberFeedItem, extractPosts, objectValue, toFeedItem } from "../lib/parse-post";

const POSTS_PER_PAGE = 30;

export interface InsideTrackResult {
	ok: boolean;
	configured: boolean;
	pinned: MemberFeedItem[];
	latest: MemberFeedItem[];
}

/**
 * The Inside Track section: one fetch of the configured space's posts,
 * partitioned server-side into the admin-curated "Start Here" pin list
 * (metadata order) and "Latest" (newest first). Pinned ids whose post no
 * longer exists in Circle are dropped from the response and lazily pruned
 * from metadata. House contract: never throws on Circle problems.
 */
export const getInsideTrack = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/inside-track",
		tags: ["Circle"],
		summary: "Inside Track section (Start Here pins + latest pieces)",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }): Promise<InsideTrackResult> => {
		const fail = (configured: boolean): InsideTrackResult => ({
			ok: false,
			configured,
			pinned: [],
			latest: [],
		});

		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const orgMetadata = parseOrgMetadata(org.metadata as string | null);
		const insideTrack = orgMetadata.circle?.insideTrack;
		const spaceId = insideTrack?.spaceId;
		if (!spaceId) {
			return { ok: true, configured: false, pinned: [], latest: [] };
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: true, configured: true, pinned: [], latest: [] };
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Inside Track: token mint failed", {
				surface: "circle.inside_track",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return fail(true);
		}

		const base = getCircleHeadlessApiBaseUrl();
		let items: MemberFeedItem[];
		try {
			const r = await fetch(
				`${base}/spaces/${encodeURIComponent(spaceId)}/posts?per_page=${POSTS_PER_PAGE}&sort=latest`,
				{ headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` } },
			);
			if (!r.ok) {
				logger.warn("[Circle] Inside Track: posts fetch failed", {
					surface: "circle.inside_track",
					status: r.status,
				});
				return fail(true);
			}
			const spaceMeta = { id: spaceId };
			const communityDomain = orgMetadata.circle?.communityDomain;
			const seen = new Set<string>();
			items = [];
			for (const post of extractPosts(await r.json())) {
				const item = toFeedItem(
					{ ...post, space: objectValue(post.space) ?? spaceMeta },
					{ communityDomain },
				);
				if (item.id && !seen.has(item.id)) {
					seen.add(item.id);
					items.push(item);
				}
			}
		} catch (error) {
			logger.warn("[Circle] Inside Track: posts fetch threw", {
				surface: "circle.inside_track",
				error: String(error),
			});
			return fail(true);
		}

		const pinnedIds = insideTrack.pinnedPostIds ?? [];
		const byId = new Map(items.map((item) => [String(item.id), item]));
		const pinned = pinnedIds
			.map((id) => byId.get(String(id)))
			.filter((item): item is MemberFeedItem => Boolean(item));
		const pinnedIdSet = new Set(pinned.map((item) => String(item.id)));
		const latest = items.filter((item) => !pinnedIdSet.has(String(item.id)));

		// Lazy prune: only when the fetch succeeded (a Circle outage must never
		// wipe the pin list). Fire-and-forget; last-write-wins is fine single-club.
		if (pinned.length !== pinnedIds.length) {
			const survivingIds = pinned.map((item) => String(item.id));
			void db.organization
				.update({
					where: { id: input.organizationId },
					data: {
						metadata: JSON.stringify({
							...orgMetadata,
							circle: {
								...orgMetadata.circle,
								insideTrack: { ...insideTrack, pinnedPostIds: survivingIds },
							},
						}),
					},
				})
				.catch((error) => {
					logger.warn("[Circle] Inside Track: pin prune failed", {
						organizationId: input.organizationId,
						error: String(error),
					});
				});
		}

		return { ok: true, configured: true, pinned, latest };
	});
