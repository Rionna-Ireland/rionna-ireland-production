/**
 * listEventAttendees procedure tests (S11-02)
 *
 * Surfaces an event's RSVPs (name + email) for admins to contact attendees.
 * Fail-safe: a missing org slug or a Circle failure both surface
 * `{ ok: false, reason }` rather than throwing.
 */
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockCreateCircleService, mockListEventAttendees } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockCreateCircleService: vi.fn(),
		mockListEventAttendees: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { organization: { findUnique: mockOrgFindUnique } },
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
}));

import { listEventAttendees } from "../procedures/list-event-attendees";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const INPUT = { organizationId: "org1", eventId: "555" };

const ATTENDEE = {
	circleMemberId: "12345",
	name: "Jane Rider",
	email: "jane@example.com",
	rsvpStatus: "yes",
	rsvpDate: "2026-08-20T09:00:00.000Z",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "rionna", metadata: "{}" });
	mockCreateCircleService.mockReturnValue({ listEventAttendees: mockListEventAttendees });
	mockListEventAttendees.mockResolvedValue({
		ok: true,
		data: { attendees: [ATTENDEE], count: 1, hasNextPage: false },
	});
});

describe("listEventAttendees (S11-02)", () => {
	it("lists attendees for the event", async () => {
		const result = await call(listEventAttendees, INPUT, ctx);

		expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
		expect(mockListEventAttendees).toHaveBeenCalledWith({ eventId: "555" });
		expect(result).toEqual({ ok: true, attendees: [ATTENDEE], count: 1 });
	});

	it("fails safe when the org has no slug", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: null, metadata: "{}" });

		const result = await call(listEventAttendees, INPUT, ctx);

		expect(result).toEqual({ ok: false, reason: "no_org_slug" });
		expect(mockListEventAttendees).not.toHaveBeenCalled();
	});

	it("surfaces a Circle failure as { ok: false, reason }", async () => {
		mockListEventAttendees.mockResolvedValue({
			ok: false,
			reason: "server_error",
			retriable: true,
		});

		const result = await call(listEventAttendees, INPUT, ctx);

		expect(result).toEqual({ ok: false, reason: "server_error" });
	});
});
