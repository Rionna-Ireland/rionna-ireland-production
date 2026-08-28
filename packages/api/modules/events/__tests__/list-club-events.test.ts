/**
 * listClubEvents procedure tests (S11-02)
 *
 * Lists the club's Circle events (admin, with RSVP counts) for the events
 * space configured in org metadata. Fail-safe: no configured space returns
 * `configured: false` rather than throwing; a Circle failure surfaces
 * `{ ok: false, reason }`.
 */
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockParseOrgMetadata,
	mockCreateCircleService,
	mockListEvents,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockParseOrgMetadata: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockListEvents: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { organization: { findUnique: mockOrgFindUnique } },
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
}));

import { listClubEvents } from "../procedures/list-club-events";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const INPUT = { organizationId: "org1" };

const EVENT_SUMMARY = {
	circleEventId: "555",
	name: "Yard visit",
	startsAt: "2026-07-01T10:00:00.000Z",
	endsAt: "2026-07-01T11:00:00.000Z",
	locationType: "tbd",
	inPersonLocation: null,
	virtualLocationUrl: null,
	rsvpCount: 3,
	rsvpLimit: null,
	coverImageUrl: null,
	url: null,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "rionna", metadata: "{}" });
	mockParseOrgMetadata.mockReturnValue({ circle: { eventsSpaceId: "2682536" } });
	mockCreateCircleService.mockReturnValue({ listEvents: mockListEvents });
	mockListEvents.mockResolvedValue({
		ok: true,
		data: { events: [EVENT_SUMMARY], hasNextPage: false },
	});
});

describe("listClubEvents (S11-02)", () => {
	it("returns configured: false and no events when no eventsSpaceId is set", async () => {
		mockParseOrgMetadata.mockReturnValue({ circle: {} });

		const result = await call(listClubEvents, INPUT, ctx);

		expect(result).toEqual({ ok: true, configured: false, events: [] });
		expect(mockListEvents).not.toHaveBeenCalled();
	});

	it("lists events for the configured space, newest first", async () => {
		const result = await call(listClubEvents, INPUT, ctx);

		expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
		expect(mockListEvents).toHaveBeenCalledWith({
			spaceId: "2682536",
			sort: "start_date_desc",
			page: 1,
		});
		expect(mockListEvents).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ ok: true, configured: true, events: [EVENT_SUMMARY] });
	});

	it("aggregates across pages while hasNextPage is true, capped at 5 pages", async () => {
		const pageTwoEvent = { ...EVENT_SUMMARY, circleEventId: "556" };
		mockListEvents
			.mockResolvedValueOnce({
				ok: true,
				data: { events: [EVENT_SUMMARY], hasNextPage: true },
			})
			.mockResolvedValueOnce({
				ok: true,
				data: { events: [pageTwoEvent], hasNextPage: false },
			});

		const result = await call(listClubEvents, INPUT, ctx);

		expect(mockListEvents).toHaveBeenCalledTimes(2);
		expect(mockListEvents).toHaveBeenNthCalledWith(1, {
			spaceId: "2682536",
			sort: "start_date_desc",
			page: 1,
		});
		expect(mockListEvents).toHaveBeenNthCalledWith(2, {
			spaceId: "2682536",
			sort: "start_date_desc",
			page: 2,
		});
		expect(result).toEqual({
			ok: true,
			configured: true,
			events: [EVENT_SUMMARY, pageTwoEvent],
		});
	});

	it("stops at the page cap and warns when more pages remain", async () => {
		mockListEvents.mockResolvedValue({
			ok: true,
			data: { events: [EVENT_SUMMARY], hasNextPage: true },
		});

		const result = await call(listClubEvents, INPUT, ctx);

		expect(mockListEvents).toHaveBeenCalledTimes(5);
		expect(result).toEqual({
			ok: true,
			configured: true,
			events: new Array(5).fill(EVENT_SUMMARY),
		});
	});

	it("surfaces a Circle failure as { ok: false, reason }", async () => {
		mockListEvents.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		const result = await call(listClubEvents, INPUT, ctx);

		expect(result).toEqual({ ok: false, reason: "server_error" });
	});

	it("fails safe when the org has no slug", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: null, metadata: "{}" });

		const result = await call(listClubEvents, INPUT, ctx);

		expect(result).toEqual({ ok: false, reason: "no_org_slug" });
		expect(mockListEvents).not.toHaveBeenCalled();
	});
});
