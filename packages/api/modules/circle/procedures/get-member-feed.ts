import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
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
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<MemberFeedResult> => {
		const fail = (): MemberFeedResult => ({ ok: false, items: [], page: input.page, hasNextPage: false });
		const empty = (): MemberFeedResult => ({ ok: true, items: [], page: input.page, hasNextPage: false });

		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const communityDomain = parseOrgMetadata(org.metadata as string | null).circle?.communityDomain;

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return empty();
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

		// 1. The member's accessible post-bearing spaces.
		let spacesRes: Response;
		try {
			spacesRes = await fetch(`${base}/spaces?per_page=100`, { headers: authHeaders });
		} catch (error) {
			logger.warn("[Circle] Member feed: spaces fetch threw", { surface: "circle.member_feed", error: String(error) });
			return fail();
		}
		if (!spacesRes.ok) {
			logger.warn("[Circle] Member feed: spaces fetch failed", {
				surface: "circle.member_feed",
				status: spacesRes.status,
			});
			return fail();
		}
		const spaces = extractPosts(await spacesRes.json())
			.filter((space) => {
				const type = textValue(space.space_type) ?? textValue(space.type);
				return type ? POST_SPACE_TYPES.has(type) : true;
			})
			.slice(0, MAX_SPACES);

		// 2. Latest posts from each space, in parallel; a failing space is skipped, not fatal.
		const perSpace = await Promise.all(
			spaces.map(async (space) => {
				const spaceMeta = { id: space.id, name: textValue(space.name), slug: textValue(space.slug) };
				try {
					const r = await fetch(
						`${base}/spaces/${encodeURIComponent(String(space.id))}/posts?per_page=${POSTS_PER_SPACE}&sort=latest`,
						{ headers: authHeaders },
					);
					if (!r.ok) return [];
					// Ensure each post carries its space context (space post lists may omit it).
					return extractPosts(await r.json()).map((post) => ({
						...post,
						space: objectValue(post.space) ?? spaceMeta,
					}));
				} catch {
					return [];
				}
			}),
		);

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
		merged.sort((a, b) => {
			const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
			const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
			return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
		});

		// 4. Offset pagination over the merged buffer.
		const start = (input.page - 1) * input.perPage;
		const items = merged.slice(start, start + input.perPage);
		return { ok: true, items, page: input.page, hasNextPage: merged.length > start + input.perPage };
	});
