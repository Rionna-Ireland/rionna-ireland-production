import { ORPCError } from "@orpc/server";
import { db, getVisiblePolls, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { buildPollCards } from "../../polls/lib/build-poll-cards";
import { CLOSED_POLL_VISIBLE_MS } from "../../polls/lib/poll-view";
import { toPollFeedItem } from "../../polls/lib/to-feed-item";
import { getFollowedHorseIds } from "../../racing/horses/lib/horse-follows";
import { readMemberFeedBuffer, writeMemberFeedBuffer } from "../lib/member-feed-cache";
import {
	type MemberFeedItem,
	extractPosts,
	objectValue,
	textValue,
	toFeedItem,
} from "../lib/parse-post";

export interface MemberFeedResult {
	ok: boolean;
	items: MemberFeedItem[];
	page: number;
	hasNextPage: boolean;
}

// Space types that carry readable posts for the feed (exclude chat/course/members).
const POST_SPACE_TYPES = new Set(["basic", "image"]);
// How many recent posts to pull per space, and how many spaces to scan, per load.
const POSTS_PER_SPACE = 15;
const MAX_SPACES = 30;

/**
 * Read-only member feed.
 *
 * NOTE: we deliberately do NOT use Circle's `/home` aggregate endpoint. It returns
 * 401 "Home page feature not applicable" for headless-provisioned members (the
 * common case here — members never accept a Circle invite), so it's unreliable for
 * our audience. Instead we read the member's accessible spaces (`/spaces`) and merge
 * the latest posts from each (`/spaces/{id}/posts`, the same endpoint `getMemberPost`
 * uses), which works for any member who can see spaces (incl. public spaces).
 */
export const getMemberFeed = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/member-feed",
		tags: ["Circle"],
		summary: "Paginated read-only Circle feed (merged from the member's spaces)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			page: z.number().min(1).default(1),
			perPage: z.number().min(1).max(30).default(15),
			// When set, return only this space's posts (e.g. a horse's discussion
			// space) — one Circle call, no merged buffer, no follow filter (the
			// member navigated to the space explicitly).
			spaceId: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<MemberFeedResult> => {
		const fail = (): MemberFeedResult => ({
			ok: false,
			items: [],
			page: input.page,
			hasNextPage: false,
		});
		const empty = (): MemberFeedResult => ({
			ok: true,
			items: [],
			page: input.page,
			hasNextPage: false,
		});

		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const orgMetadata = parseOrgMetadata(org.metadata as string | null);
		const communityDomain = orgMetadata.circle?.communityDomain;
		// S8-04 §5: when the org's follow layer is disabled, the horse-follow
		// filter below is bypassed entirely — every horse space is shown to
		// everyone (the open-community default). Never render an empty feed
		// for a "disabled" flag; that would look like an outage.
		const horseFollowsEnabled = orgMetadata.features?.horseFollows !== false;

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return empty();
		}

		// Serve pages from the short-lived merged buffer when we have one
		// (FABLE_AUDIT P4): "load more" then costs zero Circle calls, and the
		// buffer can't shift under the pagination within the TTL (C8).
		const paginate = (merged: MemberFeedItem[]): MemberFeedResult => {
			const start = (input.page - 1) * input.perPage;
			return {
				ok: true,
				items: merged.slice(start, start + input.perPage),
				page: input.page,
				hasNextPage: merged.length > start + input.perPage,
			};
		};
		const cachedBuffer = input.spaceId
			? null
			: readMemberFeedBuffer(user.id, input.organizationId);
		if (cachedBuffer) {
			return paginate(cachedBuffer);
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Member feed: token mint failed", {
				surface: "circle.member_feed",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return fail();
		}
		const base = getCircleHeadlessApiBaseUrl();
		const authHeaders = { Authorization: `Bearer ${tokenOutcome.data.accessToken}` };

		// Single-space feed (horse discussion): one Circle call, paged by Circle
		// itself. Deliberately bypasses the merged buffer (never read or written)
		// and the follow-filter *preference* — reaching this path means the
		// member opened the space explicitly. This does NOT bypass S9-05 access
		// control: an invite-only horse's space is still gated on follow status
		// below, independent of the horseFollows kill-switch (never consulted).
		if (input.spaceId) {
			// Privacy fails closed — an error must never widen access: if we can't
			// determine whether this space is an invite-only horse space (or, once
			// we know it is, who follows it), we cannot safely serve it. Bail out
			// with fail() rather than let either lookup's rejection fall through
			// to a thrown error (this file's contract: member-facing paths never
			// throw).
			try {
				const spaceHorse = await db.horse.findFirst({
					where: { circleSpaceId: input.spaceId, organizationId: input.organizationId },
					select: { id: true, inviteOnly: true },
				});
				if (spaceHorse?.inviteOnly) {
					const followedHorseIds = await getFollowedHorseIds({
						organizationId: input.organizationId,
						userId: user.id,
					});
					if (!followedHorseIds.has(spaceHorse.id)) {
						// Indistinguishable from a space with no posts — no existence leak.
						return empty();
					}
				}
			} catch (error) {
				logger.warn(
					"[Circle] Member feed: space access-gate lookup threw, failing closed",
					{
						surface: "circle.member_feed",
						userId: user.id,
						organizationId: input.organizationId,
						spaceId: input.spaceId,
						error: String(error),
					},
				);
				return fail();
			}
			try {
				const r = await fetch(
					`${base}/spaces/${encodeURIComponent(input.spaceId)}/posts?per_page=${input.perPage}&page=${input.page}&sort=latest`,
					{ headers: authHeaders },
				);
				if (!r.ok) {
					logger.warn("[Circle] Member feed: space posts fetch failed", {
						surface: "circle.member_feed",
						spaceId: input.spaceId,
						status: r.status,
					});
					return fail();
				}
				const spaceMeta = { id: input.spaceId };
				const seen = new Set<string>();
				const items: MemberFeedItem[] = [];
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
				return {
					ok: true,
					items,
					page: input.page,
					hasNextPage: items.length === input.perPage,
				};
			} catch (error) {
				logger.warn("[Circle] Member feed: space posts fetch threw", {
					surface: "circle.member_feed",
					spaceId: input.spaceId,
					error: String(error),
				});
				return fail();
			}
		}

		// 1. The member's accessible post-bearing spaces.
		let spacesRes: Response;
		try {
			spacesRes = await fetch(`${base}/spaces?per_page=100`, { headers: authHeaders });
		} catch (error) {
			logger.warn("[Circle] Member feed: spaces fetch threw", {
				surface: "circle.member_feed",
				error: String(error),
			});
			return fail();
		}
		if (!spacesRes.ok) {
			logger.warn("[Circle] Member feed: spaces fetch failed", {
				surface: "circle.member_feed",
				status: spacesRes.status,
			});
			return fail();
		}
		const typeFilteredSpaces = extractPosts(await spacesRes.json()).filter((space) => {
			const type = textValue(space.space_type) ?? textValue(space.type);
			return type ? POST_SPACE_TYPES.has(type) : true;
		});

		// S11-01: the Inside Track space has its own surface (getInsideTrack) —
		// keep lessons out of the discussion feed.
		const insideTrackSpaceId = orgMetadata.circle?.insideTrack?.spaceId;
		const feedSpaces = insideTrackSpaceId
			? typeFilteredSpaces.filter((space) => String(space.id) !== String(insideTrackSpaceId))
			: typeFilteredSpaces;

		// 1.5 Filter out unfollowed horse spaces (non-horse spaces always pass).
		//
		// Two independent gates here:
		//  - the *preference* filter (open horses, unfollowed → hidden) only
		//    applies when `horseFollowsEnabled` (S8-04 §5).
		//  - the S9-05 *access* gate (invite-only horses, unfollowed → hidden)
		//    always applies — it is NEVER conditioned on horseFollowsEnabled.
		//
		// Privacy fails closed — an error must never widen access. Two failure
		// points, two different safe fallbacks:
		//  - the horse-map lookup (classifies spaces as horse/invite-only) is
		//    the only thing that lets us tell a horse space from a non-horse
		//    one at all. If it fails we have no way to scope the damage, so we
		//    can't safely show anything: bail out with the procedure's fail()
		//    shape rather than guess.
		//  - once we have the horse map, a follow-lookup failure can be scoped:
		//    hide every known horse space (we don't know who follows what) but
		//    keep showing the non-horse spaces we already know are safe.
		const orgHorses = await db.horse
			.findMany({
				where: { organizationId: input.organizationId },
				select: { id: true, circleSpaceId: true, inviteOnly: true },
			})
			.catch((error) => {
				logger.warn(
					"[Circle] Member feed: horse map lookup failed, cannot classify spaces",
					{
						surface: "circle.member_feed",
						userId: user.id,
						organizationId: input.organizationId,
						error: String(error),
					},
				);
				return null;
			});
		if (orgHorses === null) {
			return fail();
		}
		const horseBySpaceId = new Map<string, { id: string; inviteOnly: boolean }>();
		for (const horse of orgHorses) {
			if (horse.circleSpaceId) {
				horseBySpaceId.set(String(horse.circleSpaceId), {
					id: horse.id,
					inviteOnly: horse.inviteOnly,
				});
			}
		}

		let horseFilteredSpaces = feedSpaces;
		try {
			const needsFollowedSet =
				horseFollowsEnabled || [...horseBySpaceId.values()].some((h) => h.inviteOnly);
			const followedHorseIds = needsFollowedSet
				? await getFollowedHorseIds({
						organizationId: input.organizationId,
						userId: user.id,
					})
				: null;
			horseFilteredSpaces = feedSpaces.filter((space) => {
				const horse = horseBySpaceId.get(String(space.id));
				if (!horse) return true; // not a horse space — always pass
				// S9-05: invite-only access gating — unconditional.
				if (horse.inviteOnly) return followedHorseIds?.has(horse.id) ?? false;
				// S8-04 §5: open-horse follow *preference* — only when enabled.
				if (!horseFollowsEnabled) return true;
				return followedHorseIds?.has(horse.id) ?? false;
			});
		} catch (error) {
			logger.warn("[Circle] Member feed: follow lookup failed, hiding all horse spaces", {
				surface: "circle.member_feed",
				userId: user.id,
				organizationId: input.organizationId,
				error: String(error),
			});
			// Privacy fails closed — an error must never widen access: hide every
			// horse space we know about (open or invite-only alike), leaving
			// non-horse spaces untouched.
			horseFilteredSpaces = feedSpaces.filter(
				(space) => !horseBySpaceId.has(String(space.id)),
			);
		}
		// S8-04 §5: horseFollowsEnabled === false skips the open-horse follow
		// lookup entirely when no invite-only horse space is present — no extra
		// Circle-adjacent DB call for orgs that aren't using invite-only horses.

		const spaces = horseFilteredSpaces.slice(0, MAX_SPACES);

		// 2. Latest posts from each space, in parallel; a failing space is skipped, not
		// fatal — but we count failures so a total wipe-out isn't cached as success.
		let failedSpaces = 0;
		const perSpace = await Promise.all(
			spaces.map(async (space) => {
				const spaceMeta = {
					id: space.id,
					name: textValue(space.name),
					slug: textValue(space.slug),
				};
				try {
					const r = await fetch(
						`${base}/spaces/${encodeURIComponent(String(space.id))}/posts?per_page=${POSTS_PER_SPACE}&sort=latest`,
						{ headers: authHeaders },
					);
					if (!r.ok) {
						failedSpaces++;
						return [];
					}
					// Ensure each post carries its space context (space post lists may omit it).
					return extractPosts(await r.json()).map((post) => ({
						...post,
						space: objectValue(post.space) ?? spaceMeta,
					}));
				} catch {
					failedSpaces++;
					return [];
				}
			}),
		);

		// Every space fetch failed (Circle partial outage / 429 burst): surface the
		// error path so the client shows retry, and don't cache the empty buffer for
		// the TTL (Kimi M1). A genuinely empty feed (no failures) still caches.
		if (spaces.length > 0 && failedSpaces === spaces.length) {
			logger.warn("[Circle] Member feed: every space fetch failed", {
				surface: "circle.member_feed",
				userId: user.id,
				organizationId: input.organizationId,
				spaces: spaces.length,
			});
			return fail();
		}

		// 3. Merge → map → newest-first → dedupe by id.
		const seen = new Set<string>();
		const merged: MemberFeedItem[] = [];
		for (const post of perSpace.flat()) {
			const item = toFeedItem(post, { communityDomain });
			if (item.id && !seen.has(item.id)) {
				seen.add(item.id);
				merged.push(item);
			}
		}
		// 3b. Polls (S12-01a): club-scope + space-scope for the spaces this member
		// already sees (follow-filtered above). Our rows, not Circle posts.
		if (orgMetadata.features?.polls !== false) {
			try {
				const now = new Date();
				const pollRows = await getVisiblePolls({
					organizationId: input.organizationId,
					spaceIds: spaces.map((s) => String(s.id)),
					now,
					closedWithinMs: CLOSED_POLL_VISIBLE_MS,
				});
				const cards = await buildPollCards({ polls: pollRows, userId: user.id, now });
				for (const card of cards) merged.push(toPollFeedItem(card));
			} catch (error) {
				logger.warn("[MemberFeed] poll merge failed; serving feed without polls", {
					organizationId: input.organizationId,
					userId: user.id,
					error,
				});
			}
		}

		merged.sort((a, b) => {
			const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
			const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
			return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
		});

		// 4. Cache the merged buffer, then paginate over it.
		writeMemberFeedBuffer(user.id, input.organizationId, merged);
		return paginate(merged);
	});
