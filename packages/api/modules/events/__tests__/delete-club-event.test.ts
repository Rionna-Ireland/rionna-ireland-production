/**
 * deleteClubEvent procedure tests (S11-02)
 *
 * Deletes a Circle event via Admin API v2. Mutations are audit-logged; a
 * Circle failure surfaces `{ ok: false, reason }`.
 */
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockCreateCircleService,
	mockDeleteEvent,
	mockLoggerInfo,
	mockLoggerWarn,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockDeleteEvent: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { organization: { findUnique: mockOrgFindUnique } },
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
}));

import { clearEventsCache } from "../../circle/lib/events-cache";
import { deleteClubEvent } from "../procedures/delete-club-event";

vi.mock("../../circle/lib/events-cache", async (importActual) => {
	const actual = await importActual<typeof import("../../circle/lib/events-cache")>();
	return {
		...actual,
		clearEventsCache: vi.fn(actual.clearEventsCache),
	};
});

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const INPUT = { organizationId: "org1", eventId: "555" };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "rionna", metadata: "{}" });
	mockCreateCircleService.mockReturnValue({ deleteEvent: mockDeleteEvent });
	mockDeleteEvent.mockResolvedValue({ ok: true, data: undefined });
});

describe("deleteClubEvent (S11-02)", () => {
	it("deletes the Circle event", async () => {
		const result = await call(deleteClubEvent, INPUT, ctx);

		expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
		expect(mockDeleteEvent).toHaveBeenCalledWith({ eventId: "555" });
		expect(result).toEqual({ ok: true });
	});

	it("audit-logs the delete with the acting user", async () => {
		await call(deleteClubEvent, INPUT, ctx);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_events_deleted",
				organizationId: "org1",
				eventId: "555",
				userId: "u1",
			}),
		);
	});

	it("surfaces a Circle failure as { ok: false, reason }", async () => {
		mockDeleteEvent.mockResolvedValue({ ok: false, reason: "not_found", retriable: false });

		const result = await call(deleteClubEvent, INPUT, ctx);

		expect(result).toEqual({ ok: false, reason: "not_found" });
		expect(mockLoggerInfo).not.toHaveBeenCalled();
	});

	it("fails safe when the org has no slug", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: null, metadata: "{}" });

		const result = await call(deleteClubEvent, INPUT, ctx);

		expect(result).toEqual({ ok: false, reason: "no_org_slug" });
		expect(mockDeleteEvent).not.toHaveBeenCalled();
	});

	it("clears the events cache on a successful delete (S11-02 push-race fix)", async () => {
		await call(deleteClubEvent, INPUT, ctx);

		expect(clearEventsCache).toHaveBeenCalledTimes(1);
	});

	it("does not clear the cache when the Circle delete fails", async () => {
		mockDeleteEvent.mockResolvedValue({ ok: false, reason: "not_found", retriable: false });

		await call(deleteClubEvent, INPUT, ctx);

		expect(clearEventsCache).not.toHaveBeenCalled();
	});
});
