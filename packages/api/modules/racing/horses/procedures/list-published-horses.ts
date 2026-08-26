import { getPublishedHorses } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { getFollowedHorseIds } from "../lib/horse-follows";

export const listPublishedHorses = protectedProcedure
	.route({
		method: "GET",
		path: "/horses",
		tags: ["Horses"],
		summary: "List published horses",
		description: "List all published horses for an organization, visible to members",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ input, context }) => {
		const horses = await getPublishedHorses(input.organizationId);
		const followed = await getFollowedHorseIds({
			organizationId: input.organizationId,
			userId: context.user.id,
		});

		// S9-05: an invite-only horse is visible only to members who follow it
		// (the HorseFollow row is the admin-granted invite). The followed set is
		// already fetched above — no extra query needed.
		return horses
			.filter((horse) => !horse.inviteOnly || followed.has(horse.id))
			.map((horse) => ({ ...horse, isFollowing: followed.has(horse.id) }));
	});
