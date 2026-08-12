import { ORPCError } from "@orpc/client";
import { db, listPublishedHorseUpdates } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { bodyTextFromJson } from "../lib/member-post-body-text";

/**
 * Member-facing horse updates (S8-01a2) — the consolidated replacement for
 * the standalone wellbeing timeline. Horse updates are authored as
 * MemberPosts (audienceType "horse") from the admin's "Horse updates" tab;
 * this returns the published ones for a single horse, newest first.
 */
export const getHorseUpdatesProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/horses/{horseId}/updates",
		tags: ["Horses"],
		summary: "Get a horse's published updates",
		description:
			"Published horse updates (trainer/wellbeing/general/race), newest first, visible to members",
	})
	.input(z.object({ horseId: z.string() }))
	.handler(async ({ input, context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}

		const horse = await db.horse.findFirst({
			where: {
				id: input.horseId,
				organizationId: context.session.activeOrganizationId,
				publishedAt: { not: null },
			},
			select: { id: true },
		});
		if (!horse) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		const posts = await listPublishedHorseUpdates({
			organizationId: context.session.activeOrganizationId,
			horseId: input.horseId,
		});

		return posts.map((post) => ({
			id: post.id,
			updateType: post.updateType as "trainer" | "wellbeing" | "general" | "race" | null,
			title: post.title,
			bodyText: bodyTextFromJson(post.bodyJson),
			publishedAt: post.publishedAt,
			circlePostId: post.circlePostId,
		}));
	});
