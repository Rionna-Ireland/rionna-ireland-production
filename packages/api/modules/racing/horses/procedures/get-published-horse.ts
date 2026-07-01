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

		const followed = await getFollowedHorseIds({
			organizationId: horse.organizationId,
			userId: context.user.id,
		});

		return { ...horse, isFollowing: followed.has(horse.id) };
	});
