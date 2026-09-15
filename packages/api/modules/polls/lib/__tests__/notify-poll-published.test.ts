import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendPush, mockClaim, mockRelease, mockRecordInbox } = vi.hoisted(() => ({
	mockSendPush: vi.fn(),
	mockClaim: vi.fn(),
	mockRelease: vi.fn(),
	mockRecordInbox: vi.fn(),
}));

vi.mock("../../../push/service", () => ({ sendPush: mockSendPush }));
vi.mock("@repo/database", () => ({
	claimPollNotification: mockClaim,
	releasePollNotification: mockRelease,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("../../../inbox/record", () => ({ recordInbox: mockRecordInbox }));

import { logger } from "@repo/logs";

import { notifyPollPublished } from "../notify-poll-published";

const CLUB_INPUT = {
	organizationId: "org1",
	pollId: "p1",
	question: "Which charity next?",
	scope: "club" as const,
};

const SPACE_INPUT = {
	organizationId: "org1",
	pollId: "p2",
	question: "Best warm-up routine?",
	scope: "space" as const,
	followersOfHorseId: "h1",
	circleSpaceId: "sp1",
};

const BADGE_MAP = new Map([["u1", 2]]);

beforeEach(() => {
	vi.clearAllMocks();
	mockClaim.mockResolvedValue(true);
	mockSendPush.mockResolvedValue({ attempted: 3, sent: 3, failed: 0 });
	mockRecordInbox.mockResolvedValue(BADGE_MAP);
});

describe("notifyPollPublished", () => {
	it("claims, then sends one org-wide POLL push with the deep-link payload for a club-scope poll", async () => {
		await notifyPollPublished(CLUB_INPUT);
		expect(mockClaim).toHaveBeenCalledWith("p1");
		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org1",
			triggerType: "POLL",
			triggerRefId: "p1",
			title: "New vote: Which charity next?",
			body: "Tap to have your say.",
			data: { screen: "poll", pollId: "p1" },
			badgeByUserId: BADGE_MAP,
		});
		expect(mockRelease).not.toHaveBeenCalled();
	});

	it("records an org-wide inbox item for a club-scope poll and passes badges to the push", async () => {
		await notifyPollPublished(CLUB_INPUT);
		expect(mockRecordInbox).toHaveBeenCalledWith({
			organizationId: "org1",
			audience: { kind: "org" },
			item: expect.objectContaining({
				kind: "poll",
				groupKey: "poll:p1",
				title: "New vote: Which charity next?",
				body: "Tap to have your say.",
				data: { screen: "poll", pollId: "p1" },
			}),
		});
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({ badgeByUserId: BADGE_MAP }),
		);
	});

	it("records but does not claim or push on a quiet club-scope publish", async () => {
		await notifyPollPublished({ ...CLUB_INPUT, push: false });
		expect(mockRecordInbox).toHaveBeenCalled();
		expect(mockClaim).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("records a horseFollowers inbox item with a spaceFeed deep link for a space-scope poll and passes badges to the push", async () => {
		await notifyPollPublished(SPACE_INPUT);
		expect(mockRecordInbox).toHaveBeenCalledWith({
			organizationId: "org1",
			audience: { kind: "horseFollowers", horseId: "h1" },
			item: expect.objectContaining({
				kind: "poll",
				groupKey: "poll:p2",
				title: "New vote: Best warm-up routine?",
				body: "Tap to have your say.",
				data: { screen: "spaceFeed", spaceId: "sp1" },
			}),
		});
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({ badgeByUserId: BADGE_MAP }),
		);
	});

	it("records but does not claim or push on a quiet space-scope publish", async () => {
		await notifyPollPublished({ ...SPACE_INPUT, push: false });
		expect(mockRecordInbox).toHaveBeenCalled();
		expect(mockClaim).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("does nothing when the claim is already taken (no double push)", async () => {
		mockClaim.mockResolvedValue(false);
		await notifyPollPublished(CLUB_INPUT);
		expect(mockSendPush).not.toHaveBeenCalled();
	});
	it("logs and never throws when the notification claim fails", async () => {
		mockClaim.mockRejectedValue(new Error("database unavailable"));
		await expect(notifyPollPublished(CLUB_INPUT)).resolves.toBeUndefined();
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockRelease).not.toHaveBeenCalled();
		expect(logger.error).toHaveBeenCalledWith(
			"[Polls] publish notify claim threw",
			expect.objectContaining({ pollId: "p1", error: "Error: database unavailable" }),
		);
	});
	it("releases the claim on total delivery failure", async () => {
		mockSendPush.mockResolvedValue({ attempted: 3, sent: 0, failed: 3 });
		await notifyPollPublished(CLUB_INPUT);
		expect(mockRelease).toHaveBeenCalledWith("p1");
	});
	it("logs and never throws when release fails after total delivery failure", async () => {
		mockSendPush.mockResolvedValue({ attempted: 3, sent: 0, failed: 3 });
		mockRelease.mockRejectedValue(new Error("database unavailable"));
		await expect(notifyPollPublished(CLUB_INPUT)).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			"[Polls] publish notify release threw",
			expect.objectContaining({ pollId: "p1", error: "Error: database unavailable" }),
		);
	});
	it("releases the claim and never throws when sendPush throws", async () => {
		mockSendPush.mockRejectedValue(new Error("expo down"));
		await expect(notifyPollPublished(CLUB_INPUT)).resolves.toBeUndefined();
		expect(mockRelease).toHaveBeenCalledWith("p1");
		expect(logger.error).toHaveBeenCalledWith(
			"[Polls] publish notify threw",
			expect.objectContaining({ pollId: "p1", error: "Error: expo down" }),
		);
	});
	it("logs and never throws when release fails after sendPush throws", async () => {
		mockSendPush.mockRejectedValue(new Error("expo down"));
		mockRelease.mockRejectedValue(new Error("database unavailable"));
		await expect(notifyPollPublished(CLUB_INPUT)).resolves.toBeUndefined();
		expect(logger.error).toHaveBeenCalledWith(
			"[Polls] publish notify release threw",
			expect.objectContaining({ pollId: "p1", error: "Error: database unavailable" }),
		);
	});

	it("sends a horse-follower-scoped push with a Community deep link for a space-scope poll", async () => {
		await notifyPollPublished(SPACE_INPUT);
		expect(mockClaim).toHaveBeenCalledWith("p2");
		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org1",
			triggerType: "POLL",
			triggerRefId: "p2",
			title: "New vote: Best warm-up routine?",
			body: "Tap to have your say.",
			followersOfHorseId: "h1",
			data: { screen: "community", spaceId: "sp1" },
			badgeByUserId: BADGE_MAP,
		});
		expect(mockRelease).not.toHaveBeenCalled();
	});

	it("skips the push and warns when a space-scope poll has no resolved horse", async () => {
		await notifyPollPublished({
			organizationId: "org1",
			pollId: "p2",
			question: "Best warm-up routine?",
			scope: "space",
		});
		expect(mockRecordInbox).not.toHaveBeenCalled();
		expect(mockClaim).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			"[Polls] space poll published with no horse resolved; skipping push",
			expect.objectContaining({ organizationId: "org1", pollId: "p2" }),
		);
	});

	it("skips the inbox write when a space-scope poll has no circleSpaceId, but still pushes", async () => {
		await notifyPollPublished({
			organizationId: "org1",
			pollId: "p2",
			question: "Best warm-up routine?",
			scope: "space",
			followersOfHorseId: "h1",
		});
		expect(mockRecordInbox).not.toHaveBeenCalled();
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({ followersOfHorseId: "h1", data: { screen: "community" } }),
		);
	});
});
