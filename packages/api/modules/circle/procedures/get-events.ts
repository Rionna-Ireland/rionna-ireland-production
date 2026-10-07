import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { type TypedClubEventsResult, loadMemberEvents } from "../lib/load-member-events";

/**
 * Member-facing events list (S11-02). Proxies Headless `community_events`
 * with the member's own token, so RSVP state is per-member — hence the
 * per-member cache, consulted only AFTER the membership gate (paywall, D36).
 * Fail-open on Circle problems. Tense comes from Circle's `past_events`
 * flag; ordering is ours (soonest-first upcoming, newest-first past).
 */
export const getEvents = protectedProcedure
	.route({
		method: "GET",
		path: "/circle/events",
		tags: ["Circle"],
		summary: "Club events with per-member RSVP state",
	})
	.input(
		z.object({
			organizationId: z.string(),
			scope: z.enum(["upcoming", "past"]).default("upcoming"),
		}),
	)
	.handler(async ({ input, context: { user } }): Promise<TypedClubEventsResult> => {
				const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org?.slug) {
			throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
		}
		const orgMetadata = parseOrgMetadata(org.metadata as string | null);
		const eventsSpaceId = orgMetadata.circle?.eventsSpaceId;
		if (!eventsSpaceId) {
			return { ok: true, configured: false, events: [] };
		}

		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { circleMemberId: true },
		});
		if (!member?.circleMemberId) {
			return { ok: true, configured: true, events: [] };
		}

		const result = await loadMemberEvents({
			organizationId: input.organizationId,
			orgSlug: org.slug,
			eventsSpaceId,
			userId: user.id,
			circleMemberId: member.circleMemberId,
			scope: input.scope,
		});
		return result;
	});
