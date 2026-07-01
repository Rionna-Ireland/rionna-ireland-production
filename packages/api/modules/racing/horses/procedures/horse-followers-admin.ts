import { ORPCError } from "@orpc/client";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { followAllMembers, followHorse, listHorseFollowers, unfollowHorse } from "../lib/horse-follows";

interface SessionContext {
	session: { activeOrganizationId?: string | null };
}

/** Guards the active org id from context; throws BAD_REQUEST when absent. */
function requireOrg(context: SessionContext): string {
	if (!context.session.activeOrganizationId) {
		throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
	}
	return context.session.activeOrganizationId;
}

export const listFollowersProcedure = adminProcedure
	.route({
		method: "GET",
		path: "/admin/horses/{horseId}/followers",
		tags: ["Horses"],
		summary: "List a horse's followers",
	})
	.input(z.object({ horseId: z.string() }))
	.handler(async ({ input, context }) => {
		return listHorseFollowers({ organizationId: requireOrg(context), horseId: input.horseId });
	});

export const addFollowerProcedure = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/{horseId}/followers",
		tags: ["Horses"],
		summary: "Add a follower",
	})
	.input(z.object({ horseId: z.string(), userId: z.string() }))
	.handler(async ({ input, context }) => {
		await followHorse({ organizationId: requireOrg(context), userId: input.userId, horseId: input.horseId });
		return { ok: true as const };
	});

export const removeFollowerProcedure = adminProcedure
	.route({
		method: "DELETE",
		path: "/admin/horses/{horseId}/followers/{userId}",
		tags: ["Horses"],
		summary: "Remove a follower",
	})
	.input(z.object({ horseId: z.string(), userId: z.string() }))
	.handler(async ({ input, context }) => {
		await unfollowHorse({ organizationId: requireOrg(context), userId: input.userId, horseId: input.horseId });
		return { ok: true as const };
	});

export const followAllMembersProcedure = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/{horseId}/followers/all",
		tags: ["Horses"],
		summary: "Follow all members to a horse",
	})
	.input(z.object({ horseId: z.string() }))
	.handler(async ({ input, context }) => {
		return followAllMembers({ organizationId: requireOrg(context), horseId: input.horseId });
	});
