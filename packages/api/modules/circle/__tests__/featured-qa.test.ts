import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMetaFindMany, mockLoad } = vi.hoisted(() => ({
	mockMetaFindMany: vi.fn(),
	mockLoad: vi.fn(),
}));

vi.mock("@repo/database", () => ({ db: { clubEventMeta: { findMany: mockMetaFindMany } } }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("../lib/load-member-events", () => ({ loadMemberEvents: mockLoad }));

import { getFeaturedQa } from "../lib/featured-qa";

const input = {
	organizationId: "org1",
	orgSlug: "rionna",
	eventsSpaceId: "5",
	userId: "u1",
	circleMemberId: "9",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockMetaFindMany.mockResolvedValue([{ circleEventId: "77" }]);
});

describe("getFeaturedQa", () => {
	it("returns null without touching Circle when no QA events exist", async () => {
		mockMetaFindMany.mockResolvedValue([]);
		expect(await getFeaturedQa(input)).toBeNull();
		expect(mockLoad).not.toHaveBeenCalled();
	});

	it("pre-check only counts QA rows that are not in the past (null startsAt counts)", async () => {
		mockMetaFindMany.mockResolvedValue([]);
		await getFeaturedQa(input);
		const where = mockMetaFindMany.mock.calls[0]?.[0].where;
		expect(where).toMatchObject({ organizationId: "org1", type: "QA" });
		expect(where.OR).toEqual([{ startsAt: null }, { startsAt: { gte: expect.any(Date) } }]);
		expect(mockLoad).not.toHaveBeenCalled();
	});

	it("picks the soonest upcoming QA event (events arrive soonest-first)", async () => {
		mockLoad.mockResolvedValue({
			ok: true,
			configured: true,
			events: [
				{ id: "1", title: "Race day", startsAt: "2026-10-08T10:00:00Z", eventType: "RACE_DAY" },
				{ id: "77", title: "Ask the trainer", startsAt: "2026-10-09T19:00:00Z", eventType: "QA" },
				{ id: "78", title: "Later Q&A", startsAt: "2026-11-09T19:00:00Z", eventType: "QA" },
			],
		});
		expect(await getFeaturedQa(input)).toEqual({
			kind: "qa",
			eventId: "77",
			title: "Ask the trainer",
			startsAt: "2026-10-09T19:00:00Z",
			cta: "Submit questions now",
		});
		expect(mockLoad).toHaveBeenCalledWith(expect.objectContaining({ scope: "upcoming" }));
	});

	it("returns null when no upcoming event is typed QA, or on failure", async () => {
		mockLoad.mockResolvedValue({ ok: true, configured: true, events: [] });
		expect(await getFeaturedQa(input)).toBeNull();
		mockLoad.mockRejectedValue(new Error("boom"));
		expect(await getFeaturedQa(input)).toBeNull();
	});
});
