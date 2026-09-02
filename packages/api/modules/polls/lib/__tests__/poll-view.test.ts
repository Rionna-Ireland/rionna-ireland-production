import { describe, expect, it } from "vitest";

import { resolvePollStatus, toPollCardData } from "../poll-view";

const NOW = new Date("2026-09-02T12:00:00Z");

const basePoll = {
	id: "p1",
	organizationId: "org1",
	question: "Which charity next?",
	scope: "club" as const,
	circleSpaceId: null,
	status: "open" as const,
	publishedAt: new Date("2026-09-01T09:00:00Z"),
	closesAt: null as Date | null,
	options: [
		{ id: "o2", label: "B", sortOrder: 1 },
		{ id: "o1", label: "A", sortOrder: 0 },
	],
};

describe("resolvePollStatus", () => {
	it("keeps open polls open when there is no closesAt", () => {
		expect(resolvePollStatus(basePoll, NOW)).toBe("open");
	});
	it("treats an open poll with closesAt in the past as closed (lazy auto-close)", () => {
		expect(
			resolvePollStatus({ ...basePoll, closesAt: new Date("2026-09-02T11:59:59Z") }, NOW),
		).toBe("closed");
	});
	it("leaves closesAt in the future open", () => {
		expect(
			resolvePollStatus({ ...basePoll, closesAt: new Date("2026-09-02T12:00:01Z") }, NOW),
		).toBe("open");
	});
	it("passes draft/closed through unchanged", () => {
		expect(resolvePollStatus({ ...basePoll, status: "draft" }, NOW)).toBe("draft");
		expect(resolvePollStatus({ ...basePoll, status: "closed" }, NOW)).toBe("closed");
	});
});

describe("toPollCardData", () => {
	it("hides results until the member has voted", () => {
		const card = toPollCardData({
			poll: basePoll,
			voteCounts: { o1: 3, o2: 1 },
			myVoteOptionId: null,
			now: NOW,
		});
		expect(card.results).toBeNull();
		expect(card.myVoteOptionId).toBeNull();
		expect(card.status).toBe("open");
	});
	it("shows results once the member has voted, with every option keyed", () => {
		const card = toPollCardData({
			poll: basePoll,
			voteCounts: { o1: 3 },
			myVoteOptionId: "o1",
			now: NOW,
		});
		expect(card.results).toEqual({ total: 3, byOption: { o1: 3, o2: 0 } });
	});
	it("shows results on a closed poll even without a vote", () => {
		const card = toPollCardData({
			poll: { ...basePoll, closesAt: new Date("2026-09-02T00:00:00Z") },
			voteCounts: {},
			myVoteOptionId: null,
			now: NOW,
		});
		expect(card.status).toBe("closed");
		expect(card.results).toEqual({ total: 0, byOption: { o1: 0, o2: 0 } });
	});
	it("sorts options by sortOrder and serialises dates as ISO", () => {
		const card = toPollCardData({ poll: basePoll, voteCounts: {}, myVoteOptionId: null, now: NOW });
		expect(card.options.map((o) => o.id)).toEqual(["o1", "o2"]);
		expect(card.publishedAt).toBe("2026-09-01T09:00:00.000Z");
		expect(card.closesAt).toBeNull();
	});
});
