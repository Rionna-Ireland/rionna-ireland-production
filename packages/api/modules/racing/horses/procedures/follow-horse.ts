import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { invalidateMemberFeedCache } from "../../../circle/lib/member-feed-cache";
import { followHorse, unfollowHorse } from "../lib/horse-follows";

const input = z.object({
	horseId: z.string(),
	/**
	 * The saas web app resolves the org from the URL slug and passes it here —
	 * its sessions carry no activeOrganizationId. Mobile omits it and falls
	 * back to the session's active org.
	 */
	organizationId: z.string().optional(),
});

/**
 * Resolves the org (input first, session fallback) and — because the input
 * value is caller-supplied — verifies the caller is a member of that org and
 * the horse belongs to it.
 */
async function resolveFollowRef(
	i: z.infer<typeof input>,
	context: { session: { activeOrganizationId?: string | null }; user: { id: string } },
): Promise<{ organizationId: string; userId: string; horseId: string }> {
	const organizationId = i.organizationId ?? context.session.activeOrganizationId;
	if (!organizationId) {
		throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
	}

	const member = await db.member.findFirst({
		where: { organizationId, userId: context.user.id },
		select: { id: true },
	});
	if (!member) {
		throw new ORPCError("FORBIDDEN", { message: "Not a member of this organization" });
	}

	const horse = await db.horse.findFirst({
		where: { id: i.horseId, organizationId },
		select: { id: true },
	});
	if (!horse) {
		throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
	}

	return { organizationId, userId: context.user.id, horseId: i.horseId };
}

export const followHorseProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/horses/{horseId}/follow",
		tags: ["Horses"],
		summary: "Follow a horse",
	})
	.input(input)
	.handler(async ({ input: i, context }) => {
		const ref = await resolveFollowRef(i, context);
		await followHorse(ref);
		// The follow changes the member's feed filter (and their Circle space
		// membership) — drop their cached feed buffer so it's visible now.
		invalidateMemberFeedCache(ref.userId, ref.organizationId);

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
		const ref = await resolveFollowRef(i, context);
		await unfollowHorse(ref);
		invalidateMemberFeedCache(ref.userId, ref.organizationId);

		return { ok: true as const, isFollowing: false as const };
	});
