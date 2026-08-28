/**
 * getClubEvents tests (S11-02, D32 — public marketing /events page).
 *
 * Fail-open: any missing org, missing eventsSpaceId, Circle error, or thrown
 * exception must resolve to { items: [] } — the public page must never
 * crash. Also asserts the privacy rule (spec decision 12): mapped items
 * never carry location fields, even though the underlying ClubEventSummary
 * has them.
 *
 * getClubOrganization (which getClubEvents calls internally) is wrapped in
 * React's `cache()`. Outside a request/render scope, that memoizes at
 * module scope for the life of the process — so each test resets the
 * module registry and re-imports club.ts to get a fresh cache.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetOrganizationBySlug, mockParseOrgMetadata, mockListEvents } = vi.hoisted(() => ({
	mockGetOrganizationBySlug: vi.fn(),
	mockParseOrgMetadata: vi.fn(),
	mockListEvents: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@repo/database", () => ({
	getOrganizationBySlug: mockGetOrganizationBySlug,
	getPublicHorses: vi.fn(),
	getPublishedNewsPosts: vi.fn(),
	getPublishedNewsPostBySlug: vi.fn(),
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ listEvents: mockListEvents })),
}));

const ORG = { id: "org1", name: "Rionna", slug: "rionna", metadata: "{}" };

const FUTURE = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
const PAST = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();

function event(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		circleEventId: "ev-1",
		name: "Stable visit",
		startsAt: FUTURE,
		endsAt: null,
		locationType: "in_person",
		inPersonLocation: "The Curragh, Co. Kildare",
		virtualLocationUrl: null,
		rsvpCount: 0,
		rsvpLimit: null,
		coverImageUrl: "https://example.com/cover.jpg",
		url: null,
		...overrides,
	};
}

async function importGetClubEvents() {
	const mod = await import("./club");
	return mod.getClubEvents;
}

describe("getClubEvents (S11-02, D32)", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockGetOrganizationBySlug.mockResolvedValue(ORG);
		mockParseOrgMetadata.mockReturnValue({ circle: { eventsSpaceId: "space-1" } });
		mockListEvents.mockResolvedValue({
			ok: true,
			data: { events: [event()], hasNextPage: false },
		});
	});

	it("maps upcoming events and never includes location fields (spec decision 12)", async () => {
		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents();

		expect(items).toEqual([
			{
				id: "ev-1",
				name: "Stable visit",
				startsAt: FUTURE,
				endsAt: null,
				coverImageUrl: "https://example.com/cover.jpg",
				excerpt: null,
			},
		]);
		expect(items[0]).not.toHaveProperty("inPersonLocation");
		expect(items[0]).not.toHaveProperty("virtualLocationUrl");
		expect(JSON.stringify(items)).not.toContain("Curragh");
	});

	it("passes today's UTC date as startDateFrom (S11-02 fix — page 1 truncation)", async () => {
		const getClubEvents = await importGetClubEvents();
		await getClubEvents();

		const todayUtc = new Date().toISOString().slice(0, 10);
		expect(mockListEvents).toHaveBeenCalledWith({
			spaceId: "space-1",
			sort: "start_date",
			startDateFrom: todayUtc,
		});
	});

	it("filters out events that have already ended", async () => {
		mockListEvents.mockResolvedValue({
			ok: true,
			data: {
				events: [event({ circleEventId: "past", startsAt: PAST, endsAt: PAST })],
				hasNextPage: false,
			},
		});

		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents();

		expect(items).toEqual([]);
	});

	it("respects the limit option", async () => {
		mockListEvents.mockResolvedValue({
			ok: true,
			data: {
				events: [
					event({ circleEventId: "ev-1" }),
					event({ circleEventId: "ev-2" }),
					event({ circleEventId: "ev-3" }),
				],
				hasNextPage: false,
			},
		});

		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents({ limit: 2 });

		expect(items.map((i) => i.id)).toEqual(["ev-1", "ev-2"]);
	});

	it("fails open to [] when the organization cannot be resolved", async () => {
		mockGetOrganizationBySlug.mockResolvedValue(null);

		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents();

		expect(items).toEqual([]);
		expect(mockListEvents).not.toHaveBeenCalled();
	});

	it("fails open to [] when no eventsSpaceId is configured", async () => {
		mockParseOrgMetadata.mockReturnValue({ circle: {} });

		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents();

		expect(items).toEqual([]);
		expect(mockListEvents).not.toHaveBeenCalled();
	});

	it("fails open to [] when Circle returns an error outcome", async () => {
		mockListEvents.mockResolvedValue({ ok: false, reason: "server_error", retriable: true });

		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents();

		expect(items).toEqual([]);
	});

	it("fails open to [] when getOrganizationBySlug throws", async () => {
		mockGetOrganizationBySlug.mockRejectedValue(new Error("db down"));

		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents();

		expect(items).toEqual([]);
	});

	it("fails open to [] when listEvents throws", async () => {
		mockListEvents.mockRejectedValue(new Error("network error"));

		const getClubEvents = await importGetClubEvents();
		const { items } = await getClubEvents();

		expect(items).toEqual([]);
	});
});
