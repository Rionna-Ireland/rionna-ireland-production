import { ORPCError } from "@orpc/server";
import { getMemberPostById, updateMemberPost } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

/**
 * Update a member-post draft. Only drafts (or publish_failed retries) are
 * editable — a published post is an immutable record of what went to Circle.
 */
export const updateMemberPostDraft = adminProcedure
	.route({
		method: "POST",
		path: "/admin/member-posts/update",
		tags: ["MemberPosts"],
		summary: "Update a member post draft",
	})
	.input(
		z.object({
			memberPostId: z.string(),
			title: z.string().min(1).optional(),
			updateType: z.enum(["trainer", "wellbeing", "general", "race"]).nullable().optional(),
			bodyJson: z.unknown().optional(),
			bodyHtml: z.string().nullable().optional(),
			videoUrl: z.string().url().nullable().optional(),
		}),
	)
	.handler(async ({ input }) => {
		const existing = await getMemberPostById(input.memberPostId);
		if (!existing) {
			throw new ORPCError("NOT_FOUND");
		}
		if (existing.status === "published") {
			throw new ORPCError("BAD_REQUEST", {
				message: "A published post can't be edited.",
			});
		}

		const data: Parameters<typeof updateMemberPost>[1] = {};
		if (input.title !== undefined) data.title = input.title;
		if (input.updateType !== undefined) data.updateType = input.updateType;
		if (input.bodyJson !== undefined) data.bodyJson = input.bodyJson as object;
		if (input.bodyHtml !== undefined) data.bodyHtml = input.bodyHtml;
		if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl;

		return await updateMemberPost(input.memberPostId, data);
	});
