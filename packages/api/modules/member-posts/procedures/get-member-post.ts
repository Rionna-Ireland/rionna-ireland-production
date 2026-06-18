import { ORPCError } from "@orpc/server";
import { getMemberPostById } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export const getMemberPost = adminProcedure
	.route({
		method: "GET",
		path: "/admin/member-posts/{memberPostId}",
		tags: ["MemberPosts"],
		summary: "Get a member post",
	})
	.input(z.object({ memberPostId: z.string() }))
	.handler(async ({ input }) => {
		const post = await getMemberPostById(input.memberPostId);
		if (!post) {
			throw new ORPCError("NOT_FOUND");
		}
		return post;
	});
