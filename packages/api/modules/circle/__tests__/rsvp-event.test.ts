import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockMemberFindFirst, mockGetMemberToken } = vi.hoisted(
	() => ({
		mockGetSession: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockMemberFindFirst: vi.fn(),
		mockGetMemberToken: vi.fn(),
	}),
);

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		member: { findFirst: mockMemberFindFirst },
	},
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
}));

import { invalidateEventsCacheForMember } from "../lib/events-cache";
import { rsvpEvent } from "../procedures/rsvp-event";

vi.mock("../lib/events-cache", async (importActual) => {
	const actual = await importActual<typeof import("../lib/events-cache")>();
	return {
		...actual,
		invalidateEventsCacheForMember: vi.fn(actual.invalidateEventsCacheForMember),
	};
});

const ORG_ID = "org1";
const EVENT_ID = "7";
const USER = { id: "u1", email: "u1@test.com", name: "User One", role: "user" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

function routeFetch(opts: { ok?: boolean; status?: number; body?: string; throws?: boolean } = {}) {
	return vi.fn(async (url: unknown, _init?: RequestInit) => {
		if (opts.throws) {
			throw new Error("network down");
		}
		const u = String(url);
		if (!u.includes(`/events/${EVENT_ID}/event_attendees`)) {
			throw new Error(`unexpected fetch url: ${u}`);
		}
		return {
			ok: opts.ok ?? true,
			status: opts.status ?? 200,
			text: async () => opts.body ?? "",
		};
	});
}

describe("rsvpEvent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, slug: "rionna", metadata: null });
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: "82236270" });
		mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "jwt" } });
	});

	it("going=true POSTs to event_attendees with bearer token, returns ok, invalidates cache", async () => {
		const fetchSpy = routeFetch({ ok: true, status: 201 });
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			rsvpEvent,
			{ organizationId: ORG_ID, eventId: EVENT_ID, going: true },
			ctx,
		);

		expect(res).toEqual({ ok: true, going: true });
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toContain(`/events/${EVENT_ID}/event_attendees`);
		expect(init?.method).toBe("POST");
		expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe(
			"Bearer jwt",
		);
		expect(invalidateEventsCacheForMember).toHaveBeenCalledWith(ORG_ID, USER.id);
	});

	it("going=false DELETEs event_attendees, returns ok", async () => {
		const fetchSpy = routeFetch({ ok: true, status: 204 });
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			rsvpEvent,
			{ organizationId: ORG_ID, eventId: EVENT_ID, going: false },
			ctx,
		);

		expect(res).toEqual({ ok: true, going: false });
		const [, init] = fetchSpy.mock.calls[0];
		expect(init?.method).toBe("DELETE");
	});

	it("going=false + Circle 404 is treated as success (idempotent un-RSVP)", async () => {
		vi.stubGlobal("fetch", routeFetch({ ok: false, status: 404 }));

		const res = await call(
			rsvpEvent,
			{ organizationId: ORG_ID, eventId: EVENT_ID, going: false },
			ctx,
		);

		expect(res).toEqual({ ok: true, going: false });
		expect(invalidateEventsCacheForMember).toHaveBeenCalledWith(ORG_ID, USER.id);
	});

	it("Circle 422 with body containing 'limit' maps to event_full", async () => {
		vi.stubGlobal("fetch", routeFetch({ ok: false, status: 422, body: "RSVP limit reached" }));

		const res = await call(
			rsvpEvent,
			{ organizationId: ORG_ID, eventId: EVENT_ID, going: true },
			ctx,
		);

		expect(res).toEqual({ ok: false, reason: "event_full" });
		expect(invalidateEventsCacheForMember).not.toHaveBeenCalled();
	});

	it("body containing 'disabled' maps to rsvp_disabled", async () => {
		vi.stubGlobal(
			"fetch",
			routeFetch({ ok: false, status: 422, body: "RSVPs are disabled for this event" }),
		);

		const res = await call(
			rsvpEvent,
			{ organizationId: ORG_ID, eventId: EVENT_ID, going: true },
			ctx,
		);

		expect(res).toEqual({ ok: false, reason: "rsvp_disabled" });
	});

	it("other non-2xx maps to circle_error", async () => {
		vi.stubGlobal("fetch", routeFetch({ ok: false, status: 500, body: "server error" }));

		const res = await call(
			rsvpEvent,
			{ organizationId: ORG_ID, eventId: EVENT_ID, going: true },
			ctx,
		);

		expect(res).toEqual({ ok: false, reason: "circle_error" });
	});

	it("no circleMemberId returns not_a_member without fetching", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		const fetchSpy = routeFetch();
		vi.stubGlobal("fetch", fetchSpy);

		const res = await call(
			rsvpEvent,
			{ organizationId: ORG_ID, eventId: EVENT_ID, going: true },
			ctx,
		);

		expect(res).toEqual({ ok: false, reason: "not_a_member" });
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
