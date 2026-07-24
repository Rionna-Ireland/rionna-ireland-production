/**
 * News write procedures (S5-09 Task 3.3, audit F5) — `contentHtml` must be
 * sanitized server-side in create/update, not stored verbatim: the payload
 * renders on the PUBLIC marketing site, and the "sanitised by Novel" guarantee
 * is client-side only.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockCreateNewsPost,
	mockGetNewsPostBySlug,
	mockGetNewsPostById,
	mockUpdateNewsPost,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockCreateNewsPost: vi.fn(),
	mockGetNewsPostBySlug: vi.fn(),
	mockGetNewsPostById: vi.fn(),
	mockUpdateNewsPost: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	createNewsPost: mockCreateNewsPost,
	getNewsPostBySlug: mockGetNewsPostBySlug,
	getNewsPostById: mockGetNewsPostById,
	updateNewsPost: mockUpdateNewsPost,
	claimNewsPostNotification: vi.fn(),
	releaseNewsPostNotification: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../mail/send-news-notification", () => ({
	sendNewsNotificationEmails: vi.fn(),
}));

vi.mock("../../racing/ingest/send-push", () => ({ sendPush: vi.fn() }));

import { createNewsPost } from "../procedures/create-news-post";
import { updateNewsPost } from "../procedures/update-news-post";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const XSS_HTML = '<p>hello</p><script>alert("xss")</script><img src="x" onerror="alert(1)" />';

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetNewsPostBySlug.mockResolvedValue(null);
	mockCreateNewsPost.mockImplementation(async (data: object) => ({ id: "n1", ...data }));
	mockGetNewsPostById.mockResolvedValue({
		id: "n1",
		organizationId: "org1",
		publishedAt: null,
		notificationSentAt: null,
	});
	mockUpdateNewsPost.mockResolvedValue({
		id: "n1",
		organizationId: "org1",
		title: "T",
		subtitle: null,
		featuredImageUrl: null,
		slug: "t",
	});
});

describe("createNewsPost — contentHtml sanitized on write (S5-09 / F5)", () => {
	it("stores sanitized HTML, not the raw payload", async () => {
		await call(
			createNewsPost,
			{ organizationId: "org1", title: "Race day", contentHtml: XSS_HTML },
			ctx,
		);

		expect(mockCreateNewsPost).toHaveBeenCalledTimes(1);
		const stored = mockCreateNewsPost.mock.calls[0][0].contentHtml as string;
		expect(stored).not.toContain("<script");
		expect(stored).not.toContain("onerror");
		expect(stored).toContain("<p>hello</p>");
	});
});

describe("updateNewsPost — contentHtml sanitized on write (S5-09 / F5)", () => {
	it("stores sanitized HTML, not the raw payload", async () => {
		await call(updateNewsPost, { newsPostId: "n1", contentHtml: XSS_HTML }, ctx);

		expect(mockUpdateNewsPost).toHaveBeenCalledTimes(1);
		const stored = mockUpdateNewsPost.mock.calls[0][1].contentHtml as string;
		expect(stored).not.toContain("<script");
		expect(stored).not.toContain("onerror");
		expect(stored).toContain("<p>hello</p>");
	});

	it("leaves contentHtml untouched when the input omits it", async () => {
		await call(updateNewsPost, { newsPostId: "n1", title: "T" }, ctx);

		expect(mockUpdateNewsPost.mock.calls[0][1]).not.toHaveProperty("contentHtml");
	});
});
