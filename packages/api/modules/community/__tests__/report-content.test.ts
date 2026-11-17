import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockMemberFindFirst,
	mockOrgFindUnique,
	mockCreateModerationFlag,
	mockNotifyAdminsOfReport,
	mockFetchReportedContent,
	mockCheckRateLimit,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockCreateModerationFlag: vi.fn(),
	mockNotifyAdminsOfReport: vi.fn(),
	mockFetchReportedContent: vi.fn(),
	mockCheckRateLimit: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		member: { findFirst: mockMemberFindFirst },
		organization: { findUnique: mockOrgFindUnique },
	},
	createModerationFlag: mockCreateModerationFlag,
}));
vi.mock("../lib/notify-admins-of-report", () => ({
	notifyAdminsOfReport: mockNotifyAdminsOfReport,
}));
vi.mock("../lib/reported-content", () => ({
	fetchReportedContent: mockFetchReportedContent,
}));
vi.mock("@repo/utils/lib/rate-limit", () => ({ checkRateLimit: mockCheckRateLimit }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { reportContent } from "../procedures/report-content";

const USER = { id: "u1", role: "user", name: "Jane" };
const ctx = { context: { headers: new Headers() } };

const ORG_ID = "org1";
const POST_ID = "34130292";
const COMMENT_ID = "9001";

const baseInput = {
	organizationId: ORG_ID,
	surface: "post" as const,
	postId: POST_ID,
	spaceId: "space1",
	reason: "spam" as const,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockMemberFindFirst.mockResolvedValue({ id: "m1", circleMemberId: "cm1" });
	mockOrgFindUnique.mockResolvedValue({ slug: "club" });
	mockCheckRateLimit.mockResolvedValue({ ok: true });
	mockFetchReportedContent.mockResolvedValue({
		status: "ok",
		text: "This post is spammy and unpleasant.",
		authorName: "Real Author",
	});
	mockCreateModerationFlag.mockResolvedValue({
		id: "flag1",
		contentExcerpt: "This post is spammy and unpleasant.",
	});
});

describe("community.reportContent", () => {
	it("throws when reporting a comment without commentId", async () => {
		await expect(
			call(reportContent, { ...baseInput, surface: "comment" as const }, ctx),
		).rejects.toBeTruthy();
		expect(mockCreateModerationFlag).not.toHaveBeenCalled();
	});

	it("happy path: records the flag, notifies admins once, returns ok:true", async () => {
		const result = await call(
			reportContent,
			{ ...baseInput, surface: "comment" as const, commentId: COMMENT_ID },
			ctx,
		);

		expect(mockCreateModerationFlag).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: ORG_ID,
				source: "reported",
				surface: "comment",
				memberId: "m1",
				targetPostId: POST_ID,
				targetCommentId: COMMENT_ID,
				contentExcerpt: "This post is spammy and unpleasant.",
				reason: "spam",
			}),
		);
		expect(mockNotifyAdminsOfReport).toHaveBeenCalledTimes(1);
		expect(mockNotifyAdminsOfReport).toHaveBeenCalledWith(
			expect.objectContaining({ organizationId: ORG_ID, reason: "spam" }),
		);
		expect(result).toEqual({ ok: true });
	});

	it("returns ok:true without emailing admins when the report is a duplicate", async () => {
		mockCreateModerationFlag.mockResolvedValue(null);

		const result = await call(reportContent, baseInput, ctx);

		expect(result).toEqual({ ok: true });
		expect(mockNotifyAdminsOfReport).not.toHaveBeenCalled();
	});

	it("refuses cancelled and non-members (W-04)", async () => {
		mockMemberFindFirst.mockResolvedValue(null);

		await expect(call(reportContent, baseInput, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
			data: { reason: "membership_inactive" },
		});
		expect(mockCreateModerationFlag).not.toHaveBeenCalled();
		expect(mockNotifyAdminsOfReport).not.toHaveBeenCalled();
	});

	it("W-06: rejects a post id that does not resolve in Circle, without a flag or email", async () => {
		mockFetchReportedContent.mockResolvedValue({ status: "not_found" });

		await expect(call(reportContent, baseInput, ctx)).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(mockCreateModerationFlag).not.toHaveBeenCalled();
		expect(mockNotifyAdminsOfReport).not.toHaveBeenCalled();
	});

	it("W-06: stores the excerpt and author read from Circle, ignoring client-sent ones", async () => {
		mockFetchReportedContent.mockResolvedValue({
			status: "ok",
			text: "What the post really says",
			authorName: "Trainer Tom",
		});

		await call(
			reportContent,
			{ ...baseInput, excerpt: "Fake abusive text", authorName: "Someone Else" } as never,
			ctx,
		);

		expect(mockFetchReportedContent).toHaveBeenCalledWith({
			orgSlug: "club",
			circleMemberId: "cm1",
			postId: POST_ID,
			commentId: null,
			spaceId: "space1",
		});
		expect(mockCreateModerationFlag).toHaveBeenCalledWith(
			expect.objectContaining({
				contentExcerpt: "What the post really says",
				targetAuthorName: "Trainer Tom",
			}),
		);
	});

	it("W-06: caps reports per member per day", async () => {
		mockCheckRateLimit.mockResolvedValue({ ok: false, retryAfter: 3600 });

		await expect(call(reportContent, baseInput, ctx)).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});
		expect(mockCheckRateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ key: "m1", windowSeconds: 24 * 60 * 60 }),
		);
		expect(mockFetchReportedContent).not.toHaveBeenCalled();
		expect(mockCreateModerationFlag).not.toHaveBeenCalled();
	});
});
