/**
 * createClubEvent tests (S2-09 surface E)
 *
 * Native event creation via Circle's POST /events (RSVP + reminders are built
 * into Circle events). Fail-safe like the publish flow: a missing events space
 * or a Circle failure returns { ok: false } rather than throwing, so the UI can
 * offer the "create it in Circle" fallback. No local Event model (D10).
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockOrgFindUnique,
	mockParseOrgMetadata,
	mockCreateCircleService,
	mockCreateEvent,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockParseOrgMetadata: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockCreateEvent: vi.fn(),
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

import { createClubEvent } from "../procedures/create-club-event";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const INPUT = {
	organizationId: "org1",
	name: "Yard visit",
	description: "Come and meet the horses.",
	startsAt: "2026-07-01T10:00:00.000Z",
	durationMinutes: 60,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockOrgFindUnique.mockResolvedValue({ id: "org1", slug: "rionna", metadata: "{}" });
	mockParseOrgMetadata.mockReturnValue({ circle: { eventsSpaceId: "2682536" } });
	mockCreateCircleService.mockReturnValue({ createEvent: mockCreateEvent });
	mockCreateEvent.mockResolvedValue({ ok: true, data: { circleEventId: "555" } });
});

describe("createClubEvent (S2-09 surface E)", () => {
	it("creates a Circle event in the events space and returns its id", async () => {
		const result = await call(createClubEvent, INPUT, ctx);

		expect(result).toMatchObject({ ok: true, circleEventId: "555" });
		expect(mockCreateEvent).toHaveBeenCalledWith({
			spaceId: "2682536",
			name: "Yard visit",
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
			startsAt: "2026-07-01T10:00:00.000Z",
			durationInSeconds: 3600,
			locationType: "tbd",
		});
	});

	it("fails safe (no Circle call) when no events space is configured", async () => {
		mockParseOrgMetadata.mockReturnValue({ circle: {} });

		const result = await call(createClubEvent, INPUT, ctx);

		expect(result).toMatchObject({ ok: false, reason: "no_events_space" });
		expect(mockCreateEvent).not.toHaveBeenCalled();
	});

	it("fails safe when Circle rejects the event", async () => {
		mockCreateEvent.mockResolvedValue({ ok: false, reason: "invalid_input", retriable: false });

		const result = await call(createClubEvent, INPUT, ctx);

		expect(result).toMatchObject({ ok: false, reason: "invalid_input" });
	});
});
