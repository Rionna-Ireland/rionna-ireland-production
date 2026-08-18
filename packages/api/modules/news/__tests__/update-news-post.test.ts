/**
 * updateNewsPost audit logging (S5-07 item 6) — the mutating admin handler must
 * emit a structured audit log on the happy path identifying the acting admin.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockGetNewsPostById,
	mockUpdateNewsPost,
	mockSendPush,
	mockSendNewsNotificationEmails,
	mockLoggerInfo,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetNewsPostById: vi.fn(),
	mockUpdateNewsPost: vi.fn(),
	mockSendPush: vi.fn(),
	mockSendNewsNotificationEmails: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

const { mockClaimNotification, mockReleaseNotification } = vi.hoisted(() => ({
	mockClaimNotification: vi.fn(),
	mockReleaseNotification: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	getNewsPostById: mockGetNewsPostById,
	updateNewsPost: mockUpdateNewsPost,
	claimNewsPostNotification: mockClaimNotification,
	releaseNewsPostNotification: mockReleaseNotification,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../mail/send-news-notification", () => ({
	sendNewsNotificationEmails: mockSendNewsNotificationEmails,
}));

vi.mock("../../racing/ingest/send-push", () => ({ sendPush: mockSendPush }));

import { updateNewsPost } from "../procedures/update-news-post";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetNewsPostById.mockResolvedValue({
		id: "n1",
		organizationId: "org1",
		publishedAt: null,
		notificationSentAt: null,
	});
	mockUpdateNewsPost.mockResolvedValue({
		id: "n1",
		organizationId: "org1",
		title: "Updated",
		subtitle: null,
		featuredImageUrl: null,
		slug: "updated",
	});
});

describe("updateNewsPost — audit logging (S5-07)", () => {
	it("logs the acting admin on the happy path", async () => {
		await call(updateNewsPost, { newsPostId: "n1", title: "Updated" }, ctx);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_news_post_updated",
				actorUserId: "u1",
				organizationId: "org1",
				newsPostId: "n1",
			}),
		);
	});
});

describe("updateNewsPost — publish notifications (FABLE_AUDIT P1)", () => {
	const publishInput = { newsPostId: "n1", publish: true, notifyMembersOnPublish: true };

	beforeEach(() => {
		mockClaimNotification.mockResolvedValue(true);
		mockSendPush.mockResolvedValue(undefined);
		mockSendNewsNotificationEmails.mockResolvedValue({ total: 10, sent: 10, failed: 0 });
	});

	it("claims the notification atomically before sending anything", async () => {
		await call(updateNewsPost, publishInput, ctx);

		expect(mockClaimNotification).toHaveBeenCalledWith("n1");
		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org1",
			triggerType: "NEWS_POST",
			triggerRefId: "n1",
			title: "New post: Updated",
			body: "Updated",
			data: { screen: "news", newsPostId: "updated" },
		});
		expect(mockSendNewsNotificationEmails).toHaveBeenCalled();
	});

	it("skips push and email when the claim was already taken", async () => {
		mockClaimNotification.mockResolvedValue(false);

		await call(updateNewsPost, publishInput, ctx);

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockSendNewsNotificationEmails).not.toHaveBeenCalled();
		expect(mockReleaseNotification).not.toHaveBeenCalled();
	});

	it("releases the claim when every email failed, so a re-publish can retry", async () => {
		mockSendNewsNotificationEmails.mockResolvedValue({ total: 10, sent: 0, failed: 10 });

		await call(updateNewsPost, publishInput, ctx);

		expect(mockReleaseNotification).toHaveBeenCalledWith("n1");
	});

	it("keeps the claim on a partial failure (no double-send to the successes)", async () => {
		mockSendNewsNotificationEmails.mockResolvedValue({ total: 10, sent: 7, failed: 3 });

		await call(updateNewsPost, publishInput, ctx);

		expect(mockReleaseNotification).not.toHaveBeenCalled();
	});

	it("releases the claim and rethrows when the notification pipeline throws", async () => {
		mockSendPush.mockRejectedValue(new Error("expo down"));

		await expect(call(updateNewsPost, publishInput, ctx)).rejects.toThrow("expo down");
		expect(mockReleaseNotification).toHaveBeenCalledWith("n1");
	});
});
