import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendPush, mockClaim, mockRelease } = vi.hoisted(() => ({
	mockSendPush: vi.fn(),
	mockClaim: vi.fn(),
	mockRelease: vi.fn(),
}));

vi.mock("../../../push/service", () => ({ sendPush: mockSendPush }));
vi.mock("@repo/database", () => ({
	claimPollNotification: mockClaim,
	releasePollNotification: mockRelease,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

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
};

beforeEach(() => {
	vi.clearAllMocks();
	mockClaim.mockResolvedValue(true);
	mockSendPush.mockResolvedValue({ attempted: 3, sent: 3, failed: 0 });
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
		});
		expect(mockRelease).not.toHaveBeenCalled();
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
	it("releases the claim and never throws when sendPush throws", async () => {
		mockSendPush.mockRejectedValue(new Error("expo down"));
		await expect(notifyPollPublished(CLUB_INPUT)).resolves.toBeUndefined();
		expect(mockRelease).toHaveBeenCalledWith("p1");
		expect(logger.error).toHaveBeenCalledWith(
			"[Polls] publish notify threw",
			expect.objectContaining({ pollId: "p1", error: "Error: expo down" }),
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
			data: { screen: "community" },
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
		expect(mockClaim).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledWith(
			"[Polls] space poll published with no horse resolved; skipping push",
			expect.objectContaining({ organizationId: "org1", pollId: "p2" }),
		);
	});
});
