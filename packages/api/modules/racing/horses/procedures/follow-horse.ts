import { ORPCError } from "@orpc/client";
import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { followHorse, unfollowHorse } from "../lib/horse-follows";

const input = z.object({
	horseId: z.string(),
});

export const followHorseProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/horses/{horseId}/follow",
		tags: ["Horses"],
		summary: "Follow a horse",
	})
	.input(input)
	.handler(async ({ input: i, context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}

		await followHorse({
			organizationId: context.session.activeOrganizationId,
			userId: context.user.id,
			horseId: i.horseId,
		});

		return { ok: true as const, isFollowing: true as const };
	});

export const unfollowHorseProcedure = protectedProcedure
	.route({
		method: "DELETE",
		path: "/horses/{horseId}/follow",
		tags: ["Horses"],
		summary: "Unfollow a horse",
	})
	.input(input)
	.handler(async ({ input: i, context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}

		await unfollowHorse({
			organizationId: context.session.activeOrganizationId,
			userId: context.user.id,
			horseId: i.horseId,
		});

		return { ok: true as const, isFollowing: false as const };
	});
