import { call } from "@orpc/server";
import type { OrganizationMetadata } from "@repo/database/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockMemberFindFirst,
	mockGetMemberToken,
	mockParseOrgMetadata,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockParseOrgMetadata: vi.fn(
		(_raw: string | null): OrganizationMetadata => ({
			circle: { communityDomain: "community.rionna.com" },
		}),
	),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
	},
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
}));

import { clearEventsCache } from "../lib/events-cache";
import { getEvents } from "../procedures/get-events";

const ORG_ID = "org1";
const EVENTS_SPACE_ID = "space_ev";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

function baseSettings(overrides: Record<string, unknown> = {}) {
	return {
		starts_at: "2026-09-01T10:00:00Z",
		ends_at: "2026-09-01T14:00:00Z",
		location_type: "in_person",
		in_person_location: "Naas Racecourse",
		virtual_location_url: null,
		rsvp_disabled: false,
		rsvp_limit: null,
		rsvp_count: 0,
		...overrides,
	};
}

function routeFetch(
	opts: { ok?: boolean; status?: number; records?: unknown[]; throws?: boolean } = {},
) {
	return vi.fn(async (url: unknown) => {
		if (opts.throws) {
			throw new Error("network down");
		}
		const u = String(url);
		if (!u.includes("/community_events?")) {
			throw new Error(`unexpected fetch url: ${u}`);
		}
		return {
			ok: opts.ok ?? true,
			status: opts.status ?? 200,
			json: async () => ({ records: opts.records ?? [] }),
		};
	});
}

describe("getEvents", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearEventsCache();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
		mockParseOrgMetadata.mockReturnValue({
			circle: { communityDomain: "community.rionna.com", eventsSpaceId: EVENTS_SPACE_ID },
		});
	});

	it("returns configured:false when no eventsSpaceId is set, without fetching", async () => {
		mockParseOrgMetadata.mockReturnValue({ circle: {} });
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);

		expect(res).toEqual({ ok: true, configured: false, events: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("returns configured:true with empty events when the member has no circleMemberId (paywall)", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);

		expect(res).toEqual({ ok: true, configured: true, events: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("does not leak a warm cache to a member who has just lost their circleMemberId (paywall bypass regression)", async () => {
		const fetchSpy = routeFetch({
			records: [
				{
					id: 1,
					name: "Race day",
					space: { id: EVENTS_SPACE_ID },
					event_setting_attributes: baseSettings(),
				},
			],
		});
		vi.stubGlobal("fetch", fetchSpy);

		const first = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);
		expect(first.events.length).toBe(1);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		// Membership gate must be checked BEFORE the cache is consulted — even
		// though the cache key includes userId, the gate itself must never be
		// skippable via a warm cache entry.
		mockMemberFindFirst.mockResolvedValue(null);
		const second = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);

		expect(second).toEqual({ ok: true, configured: true, events: [] });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("happy path: fetches upcoming, maps records, sorts ascending by startsAt, drops other-space records", async () => {
		const fetchSpy = routeFetch({
			records: [
				{
					id: 1,
					name: "Later event",
					space: { id: EVENTS_SPACE_ID },
					event_setting_attributes: baseSettings({ starts_at: "2026-09-05T10:00:00Z" }),
				},
				{
					id: 2,
					name: "Earlier event",
					space: { id: EVENTS_SPACE_ID },
					event_setting_attributes: baseSettings({ starts_at: "2026-09-01T10:00:00Z" }),
				},
				{
					id: 3,
					name: "Other space event",
					space: { id: "some_other_space" },
					event_setting_attributes: baseSettings({ starts_at: "2026-09-03T10:00:00Z" }),
				},
			],
		});
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);

		expect(res.ok).toBe(true);
		expect(res.configured).toBe(true);
		expect(res.events.map((e) => e.id)).toEqual(["2", "1"]);
		const calledUrl = String(fetchSpy.mock.calls[0][0]);
		expect(calledUrl).toContain("past_events=false");
	});

	it("past scope: fetches with past_events=true and sorts descending by startsAt", async () => {
		const fetchSpy = routeFetch({
			records: [
				{
					id: 1,
					name: "Older",
					space: { id: EVENTS_SPACE_ID },
					event_setting_attributes: baseSettings({ starts_at: "2026-08-01T10:00:00Z" }),
				},
				{
					id: 2,
					name: "Newer",
					space: { id: EVENTS_SPACE_ID },
					event_setting_attributes: baseSettings({ starts_at: "2026-08-10T10:00:00Z" }),
				},
			],
		});
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(getEvents, { organizationId: ORG_ID, scope: "past" }, ctx);

		expect(res.events.map((e) => e.id)).toEqual(["2", "1"]);
		const calledUrl = String(fetchSpy.mock.calls[0][0]);
		expect(calledUrl).toContain("past_events=true");
	});

	it("fails soft (and caches nothing) when Circle returns a 500", async () => {
		vi.stubGlobal("fetch", routeFetch({ ok: false, status: 500 }));

		const res = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);
		expect(res).toEqual({ ok: false, configured: true, events: [] });

		const fetchSpy = routeFetch({ records: [] });
		vi.stubGlobal("fetch", fetchSpy);
		const second = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);
		expect(second.ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("fails soft (and caches nothing) when the fetch throws", async () => {
		vi.stubGlobal("fetch", routeFetch({ throws: true }));

		const res = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);
		expect(res).toEqual({ ok: false, configured: true, events: [] });

		const fetchSpy = routeFetch({ records: [] });
		vi.stubGlobal("fetch", fetchSpy);
		const second = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);
		expect(second.ok).toBe(true);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("serves the second call within TTL from cache (one fetch total)", async () => {
		const fetchSpy = routeFetch({
			records: [
				{
					id: 1,
					name: "Race day",
					space: { id: EVENTS_SPACE_ID },
					event_setting_attributes: baseSettings(),
				},
			],
		});
		vi.stubGlobal("fetch", fetchSpy);

		const first = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const second = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);
		expect(second).toEqual(first);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("fails open when the member token mint fails, without fetching", async () => {
		mockGetMemberToken.mockResolvedValue({ ok: false, reason: "expired" });
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(getEvents, { organizationId: ORG_ID, scope: "upcoming" }, ctx);

		expect(res).toEqual({ ok: false, configured: true, events: [] });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
