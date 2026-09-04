import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindFirst, mockCreateModerationFlag, mockNotifyAdminsOfReport } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockMemberFindFirst: vi.fn(),
		mockCreateModerationFlag: vi.fn(),
		mockNotifyAdminsOfReport: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	db: {
		member: { findFirst: mockMemberFindFirst },
	},
	createModerationFlag: mockCreateModerationFlag,
}));
vi.mock("../lib/notify-admins-of-report", () => ({
	notifyAdminsOfReport: mockNotifyAdminsOfReport,
}));
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
	excerpt: "This post is spammy and unpleasant.",
	reason: "spam" as const,
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: USER });
	mockMemberFindFirst.mockResolvedValue({ id: "m1" });
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

	it("returns ok:false for a non-member", async () => {
		mockMemberFindFirst.mockResolvedValue(null);

		const result = await call(reportContent, baseInput, ctx);

		expect(result).toEqual({ ok: false });
		expect(mockCreateModerationFlag).not.toHaveBeenCalled();
		expect(mockNotifyAdminsOfReport).not.toHaveBeenCalled();
	});
});
