import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { readInsideTrackCache, writeInsideTrackCache } from "../lib/inside-track-cache";
import { type MemberFeedItem, extractPosts, objectValue, toFeedItem } from "../lib/parse-post";

const POSTS_PER_PAGE = 30;

export interface InsideTrackResult {
	ok: boolean;
	configured: boolean;
	pinned: MemberFeedItem[];
	latest: MemberFeedItem[];
}

type PinFetchOutcome =
	| { status: "found"; item: MemberFeedItem }
	| { status: "not_found" }
	| { status: "error" };

/**
 * Resolve one pinned post that wasn't on the fetched page (Finding B1 — Start
 * Here pins are by nature the oldest posts, so beyond POSTS_PER_PAGE they
 * fall off page 1). Mirrors get-member-post.ts's single-post fetch pattern.
 * A confirmed 404 means the post is genuinely gone; any other failure
 * (network throw, 429, 5xx) must NOT be mistaken for deletion.
 */
async function fetchPinnedPost(
	base: string,
	spaceId: string,
	postId: string,
	accessToken: string,
	communityDomain: string | undefined,
): Promise<PinFetchOutcome> {
	try {
		const r = await fetch(
			`${base}/spaces/${encodeURIComponent(spaceId)}/posts/${encodeURIComponent(postId)}`,
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		);
		if (r.status === 404) {
			return { status: "not_found" };
		}
		if (!r.ok) {
			logger.warn("[Circle] Inside Track: pinned post fetch failed", {
				surface: "circle.inside_track",
				postId,
				status: r.status,
			});
			return { status: "error" };
		}
		const data = await r.json();
		const envelope = objectValue(data);
		const post = objectValue(envelope?.post) ?? objectValue(envelope?.record) ?? envelope;
		if (!post) {
			return { status: "error" };
		}
		const item = toFeedItem(
			{ ...post, space: objectValue(post.space) ?? { id: spaceId } },
			{ communityDomain },
		);
		return { status: "found", item };
	} catch (error) {
		logger.warn("[Circle] Inside Track: pinned post fetch threw", {
			surface: "circle.inside_track",
			postId,
			error: String(error),
		});
		return { status: "error" };
	}
}

/**
 * Re-read the org's CURRENT metadata and drop only the confirmed-404 ids from
 * whatever is stored now (Finding B2). Never rewrites from the request-time
 * snapshot — that would silently revert any admin edit (pin change or
 * unrelated metadata key) made while this request was in flight.
 */
async function pruneConfirmedDeletedPins(
	organizationId: string,
	confirmedDeletedIds: Set<string>,
): Promise<void> {
	const freshOrg = await db.organization.findUnique({ where: { id: organizationId } });
	if (!freshOrg) return;
	const freshMetadata = parseOrgMetadata(freshOrg.metadata as string | null);
	const freshInsideTrack = freshMetadata.circle?.insideTrack;
	if (!freshInsideTrack) return;
	const freshPinnedIds = freshInsideTrack.pinnedPostIds ?? [];
	const survivingIds = freshPinnedIds.filter((id) => !confirmedDeletedIds.has(String(id)));
	if (survivingIds.length === freshPinnedIds.length) {
		// Nothing left to prune against the fresh list (e.g. an admin already
		// removed it, or re-pinned a different set entirely).
		return;
	}
	await db.organization.update({
		where: { id: organizationId },
		data: {
			metadata: JSON.stringify({
				...freshMetadata,
				circle: {
					...freshMetadata.circle,
					insideTrack: { ...freshInsideTrack, pinnedPostIds: survivingIds },
				},
			}),
		},
	});
}

/**
 * The Inside Track section: one fetch of the configured space's posts,
 * partitioned server-side into the admin-curated "Start Here" pin list
 * (metadata order) and "Latest" (newest first). A pin that has aged off the
 * fetched page is resolved with an individual fetch rather than silently
 * dropped; only a confirmed 404 is lazily pruned from metadata. House
 * contract: never throws on Circle problems. Cached per-org for 60s (the
 * response is identical for every member).
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

		// The cache is per-org, not per-member — it must only be consulted AFTER
		// the membership gate above. Reading it earlier would let any
		// authenticated-but-unpaid user (no Member row / no circleMemberId) ride
		// a warm cache straight to members-only content (paywall bypass, D36).
		const cached = readInsideTrackCache(input.organizationId);
		if (cached) {
			return { ok: true, ...cached };
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
		const communityDomain = orgMetadata.circle?.communityDomain;
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

		// Defensive dedupe — admin input is already validated distinct, but this
		// is also the resilience boundary for whatever metadata actually holds.
		const pinnedIds = [...new Set(insideTrack.pinnedPostIds ?? [])];
		const byId = new Map(items.map((item) => [String(item.id), item]));

		const missingIds = pinnedIds.filter((id) => !byId.has(String(id)));
		const resolvedMissing = new Map<string, MemberFeedItem>();
		const confirmedDeletedIds = new Set<string>();

		if (missingIds.length > 0) {
			const outcomes = await Promise.all(
				missingIds.map(async (id) => ({
					id: String(id),
					outcome: await fetchPinnedPost(
						base,
						spaceId,
						String(id),
						tokenOutcome.data.accessToken,
						communityDomain,
					),
				})),
			);
			for (const { id, outcome } of outcomes) {
				if (outcome.status === "found") {
					resolvedMissing.set(id, outcome.item);
				} else if (outcome.status === "not_found") {
					confirmedDeletedIds.add(id);
				}
				// "error" (network throw, 429, 5xx, …): exclude from this response
				// but never prune — a transient failure must never destroy a pin.
			}
		}

		const pinned = pinnedIds
			.map((id) => byId.get(String(id)) ?? resolvedMissing.get(String(id)))
			.filter((item): item is MemberFeedItem => Boolean(item));
		const pinnedIdSet = new Set(pinned.map((item) => String(item.id)));
		const latest = items.filter((item) => !pinnedIdSet.has(String(item.id)));

		// Lazy prune: only confirmed-404 ids, re-reading fresh metadata at write
		// time (Finding B2). Fire-and-forget; last-write-wins is fine single-club.
		if (confirmedDeletedIds.size > 0) {
			void pruneConfirmedDeletedPins(input.organizationId, confirmedDeletedIds).catch((error) => {
				logger.warn("[Circle] Inside Track: pin prune failed", {
					organizationId: input.organizationId,
					error: String(error),
				});
			});
		}

		writeInsideTrackCache(input.organizationId, { configured: true, pinned, latest });

		return { ok: true, configured: true, pinned, latest };
	});
