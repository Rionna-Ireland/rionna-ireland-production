/**
 * deleteNewsPost audit logging (S5-07 item 6) — the destructive admin handler
 * must emit a structured audit log on the happy path identifying the acting
 * admin.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockGetNewsPostById,
	mockDeleteNewsPost,
	mockLoggerInfo,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetNewsPostById: vi.fn(),
	mockDeleteNewsPost: vi.fn(),
	mockLoggerInfo: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	getNewsPostById: mockGetNewsPostById,
	deleteNewsPost: mockDeleteNewsPost,
}));

vi.mock("@repo/logs", () => ({ logger: { info: mockLoggerInfo } }));

import { deleteNewsPost } from "../procedures/delete-news-post";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockGetNewsPostById.mockResolvedValue({ id: "n1", organizationId: "org1" });
	mockDeleteNewsPost.mockResolvedValue(undefined);
});

describe("deleteNewsPost — audit logging (S5-07)", () => {
	it("logs the acting admin on the happy path", async () => {
		await call(deleteNewsPost, { newsPostId: "n1" }, ctx);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: "admin_news_post_deleted",
				actorUserId: "u1",
				organizationId: "org1",
				newsPostId: "n1",
			}),
		);
	});
});
