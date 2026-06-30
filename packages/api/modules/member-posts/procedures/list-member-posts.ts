import { getMemberPosts } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

export const listMemberPosts = adminProcedure
	.route({
		method: "GET",
		path: "/admin/member-posts",
		tags: ["MemberPosts"],
		summary: "List member posts",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z.enum(["draft", "published", "publish_failed"]).optional(),
			horseId: z.string().optional(),
			audienceType: z.enum(["horse", "community"]).optional(),
			limit: z.number().int().min(1).max(100).default(20),
			offset: z.number().int().min(0).default(0),
		}),
	)
	.handler(async ({ input }) => {
		return await getMemberPosts(input);
	});
