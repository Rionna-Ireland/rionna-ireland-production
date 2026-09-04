import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { type CirclePostDetail, objectValue, toPostDetail } from "../lib/parse-post";

export const getMemberPost = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/member-post",
		tags: ["Circle"],
		summary: "Read-only single Circle post for the member web surface",
	})
	.input(
		z.object({
			organizationId: z.string(),
			spaceId: z.string(),
			postId: z.string(),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<CirclePostDetail | null> => {
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const metadata = parseOrgMetadata(org.metadata as string | null);

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) return null;
		const memberCircleId = member.circleMemberId;

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Member post: token mint failed", {
				surface: "circle.member_post",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return null;
		}

		let response: Response;
		try {
			response = await fetch(
				`${getCircleHeadlessApiBaseUrl()}/spaces/${encodeURIComponent(input.spaceId)}/posts/${encodeURIComponent(input.postId)}`,
				{ headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` } },
			);
		} catch (error) {
			logger.warn("[Circle] Member post: fetch threw", { surface: "circle.member_post", error: String(error) });
			return null;
		}
		if (!response.ok) return null;

		const data = await response.json();
		const envelope = objectValue(data);
		const post = objectValue(envelope?.post) ?? objectValue(envelope?.record) ?? envelope;
		if (!post) return null;
		const detail = toPostDetail(post, { communityDomain: metadata.circle?.communityDomain });
		return {
			...detail,
			isOwn: detail.authorCircleMemberId !== null && detail.authorCircleMemberId === memberCircleId,
		};
	});
