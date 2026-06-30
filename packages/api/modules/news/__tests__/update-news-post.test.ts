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

vi.mock("@repo/database", () => ({
	getNewsPostById: mockGetNewsPostById,
	updateNewsPost: mockUpdateNewsPost,
}));

vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo } }));

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
