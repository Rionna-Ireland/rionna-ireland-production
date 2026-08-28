/**
 * updateClubEvent procedure tests (S11-02)
 *
 * Updates a Circle event via Admin API v2 PUT. Only provided fields are sent
 * (description maps to tiptap, durationMinutes maps to seconds); mutations are
 * audit-logged; a Circle failure surfaces `{ ok: false, reason }`.
 */
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockCreateCircleService,
	mockUpdateEvent,
	mockLoggerInfo,
	mockLoggerWarn,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockUpdateEvent: vi.fn(),
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
import { updateClubEvent } from "../procedures/update-club-event";

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

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "rionna", metadata: "{}" });
	mockCreateCircleService.mockReturnValue({ updateEvent: mockUpdateEvent });
	mockUpdateEvent.mockResolvedValue({ ok: true, data: { circleEventId: "555" } });
});

describe("updateClubEvent (S11-02)", () => {
	it("maps description to tiptap and durationMinutes to seconds, passing only provided fields", async () => {
		const result = await call(
			updateClubEvent,
			{
				organizationId: "org1",
				eventId: "555",
				name: "Yard visit (updated)",
				description: "Come and meet the horses.",
				durationMinutes: 90,
			},
			ctx,
		);

		expect(mockUpdateEvent).toHaveBeenCalledWith({
			eventId: "555",
			name: "Yard visit (updated)",
			tiptapBody: {
				body: {
					type: "doc",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "Come and meet the horses." }],
						},
					],
				},
			},
			startsAt: undefined,
			durationInSeconds: 5400,
			locationType: undefined,
			inPersonLocation: undefined,
			virtualLocationUrl: undefined,
			coverImageSignedId: undefined,
		});
		expect(result).toEqual({ ok: true, circleEventId: "555" });
	});

	it("audit-logs the update with the acting user", async () => {
		await call(
			updateClubEvent,
			{ organizationId: "org1", eventId: "555", name: "New name" },
			ctx,
		);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"[Events] Updated event",
			expect.objectContaining({
				event: "admin_events_updated",
				organizationId: "org1",
				eventId: "555",
				userId: "u1",
			}),
		);
	});

	it("surfaces a Circle failure as { ok: false, reason }", async () => {
		mockUpdateEvent.mockResolvedValue({ ok: false, reason: "not_found", retriable: false });

		const result = await call(
			updateClubEvent,
			{ organizationId: "org1", eventId: "555", name: "New name" },
			ctx,
		);

		expect(result).toEqual({ ok: false, reason: "not_found" });
		expect(mockLoggerInfo).not.toHaveBeenCalled();
	});

	it("fails safe when the org has no slug", async () => {
		mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: null, metadata: "{}" });

		const result = await call(
			updateClubEvent,
			{ organizationId: "org1", eventId: "555", name: "New name" },
			ctx,
		);

		expect(result).toEqual({ ok: false, reason: "no_org_slug" });
		expect(mockUpdateEvent).not.toHaveBeenCalled();
	});

	it("clears the events cache on a successful update (S11-02 push-race fix)", async () => {
		await call(
			updateClubEvent,
			{ organizationId: "org1", eventId: "555", name: "New name" },
			ctx,
		);

		expect(clearEventsCache).toHaveBeenCalledTimes(1);
	});

	it("does not clear the cache when the Circle update fails", async () => {
		mockUpdateEvent.mockResolvedValue({ ok: false, reason: "not_found", retriable: false });

		await call(
			updateClubEvent,
			{ organizationId: "org1", eventId: "555", name: "New name" },
			ctx,
		);

		expect(clearEventsCache).not.toHaveBeenCalled();
	});
});
