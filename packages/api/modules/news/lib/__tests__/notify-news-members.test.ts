/**
 * notifyNewsMembers — one-shot NEWS_POST fan-out (push + email) after an
 * admin publishes with notify on (S2-02). S12-06: an org-wide inbox item is
 * always recorded first — even on a quiet publish (`push: false`), where we
 * return right after recording (no claim, no email).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockSendPush,
	mockRecordInbox,
	mockClaimNotification,
	mockReleaseNotification,
	mockSendNewsNotificationEmails,
} = vi.hoisted(() => ({
	mockSendPush: vi.fn(),
	mockRecordInbox: vi.fn(),
	mockClaimNotification: vi.fn(),
	mockReleaseNotification: vi.fn(),
	mockSendNewsNotificationEmails: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@repo/database", () => ({
	claimNewsPostNotification: mockClaimNotification,
	releaseNewsPostNotification: mockReleaseNotification,
}));

vi.mock("../../../racing/ingest/send-push", () => ({ sendPush: mockSendPush }));

vi.mock("../../../inbox/record", () => ({ recordInbox: mockRecordInbox }));

vi.mock("../../../mail/send-news-notification", () => ({
	sendNewsNotificationEmails: mockSendNewsNotificationEmails,
}));

import { notifyNewsMembers } from "../notify-news-members";

const POST = {
	id: "n1",
	organizationId: "org-1",
	title: "Race day",
	subtitle: "Gates at noon",
	featuredImageUrl: "https://example.com/img.jpg",
	slug: "race-day",
};

const BADGE_MAP = new Map([["u1", 2]]);

beforeEach(() => {
	vi.clearAllMocks();
	mockRecordInbox.mockResolvedValue(BADGE_MAP);
	mockClaimNotification.mockResolvedValue(true);
	mockSendPush.mockResolvedValue(undefined);
	mockSendNewsNotificationEmails.mockResolvedValue({ total: 10, sent: 10, failed: 0 });
});

describe("notifyNewsMembers", () => {
	it("records the inbox item and passes badges to the push", async () => {
		await notifyNewsMembers(POST);

		expect(mockRecordInbox).toHaveBeenCalledWith({
			organizationId: "org-1",
			audience: { kind: "org" },
			item: expect.objectContaining({
				kind: "news",
				groupKey: "news:n1",
				title: "New post: Race day",
				body: "Gates at noon",
				data: { screen: "news", newsPostId: "race-day" },
				imageUrl: "https://example.com/img.jpg",
			}),
		});
		expect(mockClaimNotification).toHaveBeenCalledWith("n1");
		expect(mockSendPush).toHaveBeenCalledWith(
			expect.objectContaining({ badgeByUserId: BADGE_MAP }),
		);
	});

	it("records but does not claim, push, or email on a quiet publish", async () => {
		await notifyNewsMembers({ ...POST, push: false });

		expect(mockRecordInbox).toHaveBeenCalled();
		expect(mockClaimNotification).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockSendNewsNotificationEmails).not.toHaveBeenCalled();
	});

	it("skips push and email when the claim was already taken", async () => {
		mockClaimNotification.mockResolvedValue(false);

		await notifyNewsMembers(POST);

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockSendNewsNotificationEmails).not.toHaveBeenCalled();
	});
});
