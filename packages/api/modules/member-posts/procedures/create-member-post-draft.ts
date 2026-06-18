import { createMemberPost } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";

const audienceType = z.enum(["horse", "community"]);
const updateType = z.enum(["trainer", "wellbeing", "general"]);

/**
 * Create a member-post draft. Nothing reaches Circle here — the draft is
 * pre-Circle authoring state; publishing happens on the explicit, audience-
 * naming publish click (see publishMemberPost).
 */
export const createMemberPostDraft = adminProcedure
	.route({
		method: "POST",
		path: "/admin/member-posts",
		tags: ["MemberPosts"],
		summary: "Create a member post draft",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				audienceType,
				horseId: z.string().optional(),
				updateType: updateType.optional(),
				title: z.string().min(1),
				bodyJson: z.unknown().default({}),
				bodyHtml: z.string().optional(),
				videoUrl: z.string().url().optional(),
			})
			.refine((v) => v.audienceType !== "horse" || Boolean(v.horseId), {
				message: "A horse update needs a horse.",
				path: ["horseId"],
			}),
	)
	.handler(async ({ input, context }) => {
		return await createMemberPost({
			organizationId: input.organizationId,
			authorUserId: context.user.id,
			audienceType: input.audienceType,
			horseId: input.horseId ?? null,
			updateType: input.updateType ?? null,
			title: input.title,
			bodyJson: input.bodyJson as object,
			bodyHtml: input.bodyHtml ?? null,
			videoUrl: input.videoUrl ?? null,
		});
	});
