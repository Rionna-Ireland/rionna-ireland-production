import { logger } from "@repo/logs";
import { createCircleService, getCircleHeadlessApiBaseUrl } from "@repo/payments/lib/circle";

import { withEventTypes } from "../../events/lib/event-meta";
import { readEventsCache, writeEventsCache } from "./events-cache";
import { type ClubEvent, type ClubEventsResult, toClubEvent } from "./parse-event";

const EVENTS_PER_PAGE = 50;

export type TypedClubEvent = ClubEvent & { type: string; eventType: string };
export type TypedClubEventsResult = Omit<ClubEventsResult, "events"> & { events: TypedClubEvent[] };

/**
 * Member-scoped events fetch shared by `getEvents` and the feed's featured Q&A
 * card. Caller must already have passed the membership gate (the cache is only
 * consulted here, after it). Event types are attached AFTER the cache so an
 * admin type edit is never masked by a cached payload.
 */
export async function loadMemberEvents(input: {
	organizationId: string;
	orgSlug: string;
	eventsSpaceId: string | number;
	userId: string;
	circleMemberId: string;
	scope: "upcoming" | "past";
}): Promise<TypedClubEventsResult> {
	const fail = (): TypedClubEventsResult => ({ ok: false, configured: true, events: [] });
	const { organizationId, userId, scope, eventsSpaceId } = input;

	const cached = readEventsCache(organizationId, userId, scope);
	if (cached) {
		return { ...cached, events: await withEventTypes(organizationId, cached.events) };
	}

	const service = createCircleService(input.orgSlug);
	const tokenOutcome = await service.getMemberToken(input.circleMemberId);
	if (!tokenOutcome.ok) {
		logger.warn("[Circle] Events: token mint failed", {
			surface: "circle.events",
			userId,
			organizationId,
			reason: tokenOutcome.reason,
		});
		return fail();
	}

	const base = getCircleHeadlessApiBaseUrl();
	let events: ClubEvent[];
	try {
		const r = await fetch(
			`${base}/community_events?past_events=${scope === "past"}&per_page=${EVENTS_PER_PAGE}`,
			{ headers: { Authorization: `Bearer ${tokenOutcome.data.accessToken}` } },
		);
		if (!r.ok) {
			logger.warn("[Circle] Events: fetch failed", {
				surface: "circle.events",
				status: r.status,
			});
			return fail();
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
				scope: scope,
			});
		}
	} catch (error) {
		logger.warn("[Circle] Events: fetch threw", {
			surface: "circle.events",
			error: String(error),
		});
		return fail();
	}

	const byStart = (a: ClubEvent, b: ClubEvent) =>
		(a.startsAt ?? "").localeCompare(b.startsAt ?? "");
	events.sort(scope === "upcoming" ? byStart : (a, b) => byStart(b, a));

	const result: ClubEventsResult = { ok: true, configured: true, events };
	writeEventsCache(organizationId, userId, scope, result);
	return { ...result, events: await withEventTypes(organizationId, result.events) };
}
