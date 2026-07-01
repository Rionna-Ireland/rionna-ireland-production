import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import {
	createCircleService,
	getCircleHeadlessApiBaseUrl,
} from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { extractPosts, objectValue, toFeedItem } from "../lib/parse-post";

export const getFeed = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/feed",
		tags: ["Circle"],
		summary: "Get latest Circle home-feed posts for Pulse",
	})
	.input(
		z.object({
			organizationId: z.string(),
			limit: z.number().min(1).max(10).default(5),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
		});
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}

		const metadata = parseOrgMetadata(org.metadata as string | null);
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) return [];

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Feed: token mint failed", {
				surface: "circle.feed",
				userId: user.id,
				organizationId: input.organizationId,
				circleMemberId: member.circleMemberId,
				reason: tokenOutcome.reason,
				retriable: tokenOutcome.retriable,
			});
			return [];
		}

		const response = await fetch(
			`${getCircleHeadlessApiBaseUrl()}/home?per_page=${input.limit}&sort=latest`,
			{ headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` } },
		);

		if (!response.ok) {
			logger.warn("[Circle] Feed: Headless home fetch failed", {
				surface: "circle.feed",
				userId: user.id,
				organizationId: input.organizationId,
				status: response.status,
			});
			return [];
		}

		const data = await response.json();
		const posts = extractPosts(data);

		if (posts.length === 0) {
			logger.warn("[Circle] Feed: Headless home returned no mappable posts", {
				surface: "circle.feed",
				userId: user.id,
				organizationId: input.organizationId,
				responseKeys: objectValue(data) ? Object.keys(objectValue(data)!).sort() : [],
			});
		}

		return posts.map((post) => toFeedItem(post, { communityDomain: metadata.circle?.communityDomain }));
	});
