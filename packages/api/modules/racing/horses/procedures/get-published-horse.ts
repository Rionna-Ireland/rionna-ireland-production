import { ORPCError } from "@orpc/client";
import { getPublishedHorseById } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { getFollowedHorseIds } from "../lib/horse-follows";

export const getPublishedHorse = protectedProcedure
	.route({
		method: "GET",
		path: "/horses/{horseId}",
		tags: ["Horses"],
		summary: "Get published horse",
		description:
			"Get a published horse with trainer and recent race entries, visible to members",
	})
	.input(
		z.object({
			horseId: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const horse = await getPublishedHorseById(input.horseId);

		if (!horse) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		// Fetched once and reused below for both the S9-05 access check and
		// `isFollowing` — avoids a second identical HorseFollow lookup (see
		// canAccessHorse in lib/horse-access.ts, which this inlines here rather
		// than calling, precisely to share this one query).
		const followed = await getFollowedHorseIds({
			organizationId: horse.organizationId,
			userId: context.user.id,
		});

		// S9-05: an invite-only horse the caller doesn't follow is indistinguishable
		// from a nonexistent one — same error, no existence leak.
		if (horse.inviteOnly && !followed.has(horse.id)) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}

		return { ...horse, isFollowing: followed.has(horse.id) };
	});
