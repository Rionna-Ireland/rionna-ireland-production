/**
 * createNewsPost publish notifications — create+publish+notify must fan out
 * the same one-shot NEWS_POST push + email as updateNewsPost (S2-02). The
 * create path used to persist notifyMembersOnPublish and return, so a
 * first-shot "Publish and notify" never reached Expo.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockCreateNewsPost,
	mockGetNewsPostBySlug,
	mockSendPush,
	mockSendNewsNotificationEmails,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockCreateNewsPost: vi.fn(),
	mockGetNewsPostBySlug: vi.fn(),
	mockSendPush: vi.fn(),
	mockSendNewsNotificationEmails: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

const { mockClaimNotification, mockReleaseNotification } = vi.hoisted(() => ({
	mockClaimNotification: vi.fn(),
	mockReleaseNotification: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	createNewsPost: mockCreateNewsPost,
	getNewsPostBySlug: mockGetNewsPostBySlug,
	claimNewsPostNotification: mockClaimNotification,
	releaseNewsPostNotification: mockReleaseNotification,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../mail/send-news-notification", () => ({
	sendNewsNotificationEmails: mockSendNewsNotificationEmails,
}));

vi.mock("../../racing/ingest/send-push", () => ({ sendPush: mockSendPush }));

import { createNewsPost } from "../procedures/create-news-post";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const CREATED = {
	id: "n1",
	organizationId: "org1",
	title: "Race day",
	subtitle: "Gates at noon",
	featuredImageUrl: null,
	slug: "race-day",
};

const publishNotifyInput = {
	organizationId: "org1",
	title: "Race day",
	subtitle: "Gates at noon",
	publish: true,
	notifyMembersOnPublish: true,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetNewsPostBySlug.mockResolvedValue(null);
	mockCreateNewsPost.mockResolvedValue(CREATED);
	mockClaimNotification.mockResolvedValue(true);
	mockSendPush.mockResolvedValue(undefined);
	mockSendNewsNotificationEmails.mockResolvedValue({ total: 10, sent: 10, failed: 0 });
});

describe("createNewsPost — publish notifications (S2-02)", () => {
	it("fans out push and email when create publishes with notify on", async () => {
		await call(createNewsPost, publishNotifyInput, ctx);

		expect(mockClaimNotification).toHaveBeenCalledWith("n1");
		expect(mockSendPush).toHaveBeenCalledWith({
			organizationId: "org1",
			triggerType: "NEWS_POST",
			triggerRefId: "n1",
			title: "New post: Race day",
			body: "Gates at noon",
			data: { screen: "news", newsPostId: "race-day" },
		});
		expect(mockSendNewsNotificationEmails).toHaveBeenCalledWith({
			id: "n1",
			organizationId: "org1",
			title: "Race day",
			subtitle: "Gates at noon",
			featuredImageUrl: null,
			slug: "race-day",
		});
	});

	it("does not fan out when saving a draft", async () => {
		await call(
			createNewsPost,
			{ organizationId: "org1", title: "Race day", notifyMembersOnPublish: true },
			ctx,
		);

		expect(mockClaimNotification).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockSendNewsNotificationEmails).not.toHaveBeenCalled();
	});

	it("does not fan out when publishing with notify off", async () => {
		await call(
			createNewsPost,
			{ organizationId: "org1", title: "Race day", publish: true },
			ctx,
		);

		expect(mockClaimNotification).not.toHaveBeenCalled();
		expect(mockSendPush).not.toHaveBeenCalled();
	});

	it("skips push and email when the claim was already taken", async () => {
		mockClaimNotification.mockResolvedValue(false);

		await call(createNewsPost, publishNotifyInput, ctx);

		expect(mockSendPush).not.toHaveBeenCalled();
		expect(mockSendNewsNotificationEmails).not.toHaveBeenCalled();
		expect(mockReleaseNotification).not.toHaveBeenCalled();
	});

	it("releases the claim when every email failed, so a re-publish can retry", async () => {
		mockSendNewsNotificationEmails.mockResolvedValue({ total: 10, sent: 0, failed: 10 });

		await call(createNewsPost, publishNotifyInput, ctx);

		expect(mockReleaseNotification).toHaveBeenCalledWith("n1");
	});

	it("releases the claim and rethrows when the notification pipeline throws", async () => {
		mockSendPush.mockRejectedValue(new Error("expo down"));

		await expect(call(createNewsPost, publishNotifyInput, ctx)).rejects.toThrow("expo down");
		expect(mockReleaseNotification).toHaveBeenCalledWith("n1");
	});
});
