import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { z } from "zod";

import { memberProcedure } from "../../../orpc/procedures";
import { enrichPosts } from "../lib/author-identity";
import { memberCircleFetch } from "../lib/member-circle-fetch";
import { type CirclePostDetail, objectValue, toPostDetail } from "../lib/parse-post";

export const getMemberPost = memberProcedure
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

		const response = await memberCircleFetch(
			{ orgSlug: org.slug, circleMemberId: memberCircleId },
			`/spaces/${encodeURIComponent(input.spaceId)}/posts/${encodeURIComponent(input.postId)}`,
			{},
			{ surface: "circle.member_post", userId: user.id, organizationId: input.organizationId },
		);
		if (!response) return null;
		if (!response.ok) return null;

		const data = await response.json();
		const envelope = objectValue(data);
		const post = objectValue(envelope?.post) ?? objectValue(envelope?.record) ?? envelope;
		if (!post) return null;
		const detail = toPostDetail(post, { communityDomain: metadata.circle?.communityDomain });
		const [enriched] = await enrichPosts(input.organizationId, [detail], {
			announcementSpaceId: metadata.circle?.communitySpaceId,
		});
		return {
			...(enriched ?? detail),
			isOwn: detail.authorCircleMemberId !== null && detail.authorCircleMemberId === memberCircleId,
		};
	});
