import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { type MemberFeedItem, extractPosts, objectValue, toFeedItem } from "../lib/parse-post";

export interface MemberFeedResult {
	ok: boolean;
	items: MemberFeedItem[];
	page: number;
	hasNextPage: boolean;
}

export const getMemberFeed = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/member-feed",
		tags: ["Circle"],
		summary: "Paginated read-only Circle home feed for the member web surface",
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

		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const metadata = parseOrgMetadata(org.metadata as string | null);

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: true, items: [], page: input.page, hasNextPage: false };
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

		let response: Response;
		try {
			response = await fetch(
				`${getCircleHeadlessApiBaseUrl()}/home?page=${input.page}&per_page=${input.perPage}&sort=latest`,
				{ headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` } },
			);
		} catch (error) {
			logger.warn("[Circle] Member feed: home fetch threw", { surface: "circle.member_feed", error: String(error) });
			return fail();
		}
		if (!response.ok) {
			logger.warn("[Circle] Member feed: home fetch failed", {
				surface: "circle.member_feed",
				status: response.status,
			});
			return fail();
		}

		const data = await response.json();
		const envelope = objectValue(data);
		const posts = extractPosts(data);
		return {
			ok: true,
			items: posts.map((post) => toFeedItem(post, { communityDomain: metadata.circle?.communityDomain })),
			page: input.page,
			hasNextPage: envelope?.has_next_page === true,
		};
	});
