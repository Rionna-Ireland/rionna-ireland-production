import { ORPCError } from "@orpc/client";
import { db, listLatestTrainerUpdates } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { getAccessibleHorseWhere } from "../../racing/horses/lib/horse-access";
import { bodyTextFromJson } from "../../racing/horses/lib/member-post-body-text";

/**
 * Pulse "Trainer Updates" tile (S8-07) — latest published trainer-type
 * horse updates, org-wide, for published horses only. Repoints the tile at
 * MemberPost (source of truth since S8-01 A2) instead of the legacy
 * dedicated Circle space, which nothing writes to anymore.
 */
export const getLatestTrainerUpdatesProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/member-posts/trainer-updates",
		tags: ["MemberPosts"],
		summary: "Get the latest published trainer updates, org-wide",
	})
	.input(
		z.object({
			organizationId: z.string(),
			limit: z.number().min(1).max(10).default(3),
		}),
	)
	.handler(async ({ input, context }) => {
		const member = await db.member.findFirst({
			where: { organizationId: input.organizationId, userId: context.user.id },
			select: { id: true },
		});
		if (!member) {
			throw new ORPCError("FORBIDDEN", { message: "Not a member of this organization" });
		}

		const horseWhere = await getAccessibleHorseWhere({
			organizationId: input.organizationId,
			userId: context.user.id,
		});

		const posts = await listLatestTrainerUpdates({
			organizationId: input.organizationId,
			limit: input.limit,
			horseWhere,
		});

		return posts
			.filter((post) => post.horse !== null)
			.map((post) => ({
				id: post.id,
				horseId: post.horseId as string,
				horseName: post.horse!.name,
				title: post.title,
				bodyText: bodyTextFromJson(post.bodyJson),
				publishedAt: post.publishedAt,
			}));
	});
