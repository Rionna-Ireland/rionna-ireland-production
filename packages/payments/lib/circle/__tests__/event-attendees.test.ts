/**
 * RealCircleService.listEventAttendees (S11-02)
 *
 * GET /api/admin/v2/event_attendees returns the standard pagination
 * envelope (page, per_page, has_next_page, count, records) where each
 * record is FLAT: { id, event_id, community_member_id, contact_id,
 * contact_type, rsvp_status, event_name, member_name, member_email,
 * member_avatar_url, headline, rsvp_date } — probed against staging
 * 2026-08-30.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@circleco/headless-server-sdk", () => ({
	createClient: vi.fn(() => ({})),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
}));

import { RealCircleService } from "../real";

function makeService() {
	return new RealCircleService("admin-token", "headless-app-token");
}

/** Verbatim probed record shape (staging, 2026-08-30). */
function probedRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: 9001,
		event_id: 555,
		community_member_id: 12345,
		contact_id: 12345,
		contact_type: "CommunityMember",
		rsvp_status: "yes",
		event_name: "Yard visit",
		member_name: "Jane Rider",
		member_email: "jane@example.com",
		member_avatar_url: "https://circle.example.com/avatar.png",
		headline: "Member since 2024",
		rsvp_date: "2026-08-20T09:00:00.000Z",
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("RealCircleService.listEventAttendees", () => {
	it("maps the probed record shape into an EventAttendee", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					page: 1,
					per_page: 100,
					has_next_page: false,
					count: 1,
					records: [probedRecord()],
				}),
			}),
		);

		const outcome = await makeService().listEventAttendees({ eventId: "555" });

		expect(outcome).toEqual({
			ok: true,
			data: {
				attendees: [
					{
						circleMemberId: "12345",
						name: "Jane Rider",
						email: "jane@example.com",
						rsvpStatus: "yes",
						rsvpDate: "2026-08-20T09:00:00.000Z",
					},
				],
				count: 1,
				hasNextPage: false,
			},
		});
	});

	it("defaults missing optional fields to null", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					has_next_page: false,
					count: 1,
					records: [
						{
							id: 9002,
							community_member_id: 777,
							// member_name, member_email, rsvp_status, rsvp_date all absent.
						},
					],
				}),
			}),
		);

		const outcome = await makeService().listEventAttendees({ eventId: "555" });

		expect(outcome).toEqual({
			ok: true,
			data: {
				attendees: [
					{
						circleMemberId: "777",
						name: null,
						email: null,
						rsvpStatus: null,
						rsvpDate: null,
					},
				],
				count: 1,
				hasNextPage: false,
			},
		});
	});

	it("skips records with no community_member_id", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					has_next_page: false,
					count: 2,
					records: [
						probedRecord({ community_member_id: null }),
						probedRecord({ id: 9003, community_member_id: 54321 }),
					],
				}),
			}),
		);

		const outcome = await makeService().listEventAttendees({ eventId: "555" });

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) throw new Error("expected ok");
		expect(outcome.data.attendees).toHaveLength(1);
		expect(outcome.data.attendees[0]?.circleMemberId).toBe("54321");
	});

	it("requests per_page=100 by default and passes the eventId through", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ has_next_page: false, count: 0, records: [] }),
		});
		vi.stubGlobal("fetch", fetchMock);

		await makeService().listEventAttendees({ eventId: "555" });

		const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
		expect(calledUrl).toContain("/event_attendees?");
		expect(calledUrl).toContain("event_id=555");
		expect(calledUrl).toContain("per_page=100");
	});

	it("returns a network failure without throwing", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

		const outcome = await makeService().listEventAttendees({ eventId: "555" });

		expect(outcome.ok).toBe(false);
		if (outcome.ok) throw new Error("expected failure");
		expect(outcome.reason).toBe("network");
		expect(outcome.retriable).toBe(true);
	});

	it("classifies a 404 as not_found, non-retriable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
				text: async () => "not found",
			}),
		);

		const outcome = await makeService().listEventAttendees({ eventId: "555" });

		expect(outcome).toEqual({
			ok: false,
			reason: "not_found",
			retriable: false,
			raw: "not found",
		});
	});

	it("classifies a 500 as server_error, retriable", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				text: async () => "boom",
			}),
		);

		const outcome = await makeService().listEventAttendees({ eventId: "555" });

		expect(outcome).toEqual({
			ok: false,
			reason: "server_error",
			retriable: true,
			raw: "boom",
		});
	});
});
