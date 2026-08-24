import { ORPCError } from "@orpc/client";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import {
	clearMemberFeedCache,
	invalidateMemberFeedCache,
} from "../../../circle/lib/member-feed-cache";
import {
	followAllMembers,
	followHorse,
	listHorseFollowers,
	unfollowHorse,
} from "../lib/horse-follows";

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
		const organizationId = requireOrg(context);
		const result = await followHorse({
			organizationId,
			userId: input.userId,
			horseId: input.horseId,
		});
		if (!result.ok) {
			return { ok: false as const, disabled: true as const };
		}
		// The member's feed filter changed under them — drop their cached buffer.
		invalidateMemberFeedCache(input.userId, organizationId);
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
		const organizationId = requireOrg(context);
		const result = await unfollowHorse({
			organizationId,
			userId: input.userId,
			horseId: input.horseId,
		});
		if (!result.ok) {
			return { ok: false as const, disabled: true as const };
		}
		invalidateMemberFeedCache(input.userId, organizationId);
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
		const result = await followAllMembers({
			organizationId: requireOrg(context),
			horseId: input.horseId,
		});
		if (!result.disabled && !result.skippedInviteOnly) {
			// Every member's feed filter changed — nuke all cached buffers.
			clearMemberFeedCache();
		}
		return result;
	});
