import { ORPCError } from "@orpc/server";
import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { readEventsCache, writeEventsCache } from "../lib/events-cache";
import { type ClubEvent, type ClubEventsResult, toClubEvent } from "../lib/parse-event";

const EVENTS_PER_PAGE = 50;

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
	.handler(async ({ input, context: { user } }): Promise<ClubEventsResult> => {
		const fail = (configured: boolean): ClubEventsResult => ({
			ok: false,
			configured,
			events: [],
		});

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

		// Cache only after the membership gate (S11-01 paywall lesson).
		const cached = readEventsCache(input.organizationId, user.id, input.scope);
		if (cached) {
			return cached;
		}

		const service = createCircleService(org.slug);
		const tokenOutcome = await service.getMemberToken(member.circleMemberId);
		if (!tokenOutcome.ok) {
			logger.warn("[Circle] Events: token mint failed", {
				surface: "circle.events",
				userId: user.id,
				organizationId: input.organizationId,
				reason: tokenOutcome.reason,
			});
			return fail(true);
		}

		const base = getCircleHeadlessApiBaseUrl();
		let events: ClubEvent[];
		try {
			const r = await fetch(
				`${base}/community_events?past_events=${input.scope === "past"}&per_page=${EVENTS_PER_PAGE}`,
				{ headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` } },
			);
			if (!r.ok) {
				logger.warn("[Circle] Events: fetch failed", {
					surface: "circle.events",
					status: r.status,
				});
				return fail(true);
			}
			const data = (await r.json()) as { records?: unknown[]; has_next_page?: boolean };
			events = (Array.isArray(data.records) ? data.records : [])
				.map((record) => toClubEvent(record as Record<string, unknown>))
				.filter((event): event is ClubEvent => event !== null)
				// A stray second event space must not leak into the club surface.
				.filter(
					(event) => event.spaceId === null || event.spaceId === String(eventsSpaceId),
				);
			if (data.has_next_page === true) {
				logger.warn("[Circle] Events: more than one page; showing first page only", {
					surface: "circle.events",
					scope: input.scope,
				});
			}
		} catch (error) {
			logger.warn("[Circle] Events: fetch threw", {
				surface: "circle.events",
				error: String(error),
			});
			return fail(true);
		}

		const byStart = (a: ClubEvent, b: ClubEvent) =>
			(a.startsAt ?? "").localeCompare(b.startsAt ?? "");
		events.sort(input.scope === "upcoming" ? byStart : (a, b) => byStart(b, a));

		const result: ClubEventsResult = { ok: true, configured: true, events };
		writeEventsCache(input.organizationId, user.id, input.scope, result);
		return result;
	});
