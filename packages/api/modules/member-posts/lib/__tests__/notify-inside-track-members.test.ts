/**
 * notifyInsideTrackMembers — best-effort INSIDE_TRACK push (org-wide,
 * insideTrack pref) fired when an admin publishes an Inside Track piece
 * with "Notify members" checked. triggerRefId is the memberPost id so
 * PushLog dedup does not collide with other trigger types (S11-01).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendPush } = vi.hoisted(() => ({
	mockSendPush: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../push/service", () => ({
	sendPush: mockSendPush,
}));

import { notifyInsideTrackMembers } from "../notify-inside-track-members";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("notifyInsideTrackMembers", () => {
	it("fires an org-wide INSIDE_TRACK push with the insideTrack screen", async () => {
		mockSendPush.mockResolvedValue({ attempted: 2, sent: 2, failed: 0 });

		await notifyInsideTrackMembers({
			organizationId: "org-1",
			memberPostId: "mp-1",
			title: "How to read a racecard",
		});

		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org-1",
			triggerType: "INSIDE_TRACK",
			triggerRefId: "mp-1",
			title: "How to read a racecard",
			body: "New from the Inside Track.",
			data: { screen: "insideTrack" },
		});
	});

	it("never throws when sendPush itself throws — the publish already committed", async () => {
		mockSendPush.mockRejectedValue(new Error("db unavailable"));

		await expect(
			notifyInsideTrackMembers({
				organizationId: "org-1",
				memberPostId: "mp-1",
				title: "Title",
			}),
		).resolves.toBeUndefined();
	});

	it("never throws when delivery fails for the whole audience", async () => {
		mockSendPush.mockResolvedValue({ attempted: 3, sent: 0, failed: 3 });

		await expect(
			notifyInsideTrackMembers({
				organizationId: "org-1",
				memberPostId: "mp-1",
				title: "Title",
			}),
		).resolves.toBeUndefined();
	});
});
