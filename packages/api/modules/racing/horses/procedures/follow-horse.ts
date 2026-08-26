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
): Promise<{ organizationId: string; userId: string; horseId: string; inviteOnly: boolean }> {
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
		select: { id: true, inviteOnly: true },
	});
	if (!horse) {
		throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
	}

	return {
		organizationId,
		userId: context.user.id,
		horseId: i.horseId,
		inviteOnly: horse.inviteOnly,
	};
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
		if (ref.inviteOnly) {
			// S9-05: invite-only — members can't self-follow; admin add is the invite.
			return { ok: false as const, inviteOnly: true as const };
		}
		const result = await followHorse(ref);
		if (!result.ok) {
			// S8-04 §5: features.horseFollows disabled — no DB write, no Circle
			// join happened, so there's no feed filter change to invalidate for.
			return { ok: false as const, disabled: true as const };
		}
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
		const result = await unfollowHorse(ref);
		if (!result.ok) {
			return { ok: false as const, disabled: true as const };
		}
		invalidateMemberFeedCache(ref.userId, ref.organizationId);

		return { ok: true as const, isFollowing: false as const };
	});
