import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMemberCircleFetch, mockFetchPostComment } = vi.hoisted(() => ({
	mockMemberCircleFetch: vi.fn(),
	mockFetchPostComment: vi.fn(),
}));

vi.mock("../../circle/lib/member-circle-fetch", () => ({
	memberCircleFetch: mockMemberCircleFetch,
}));
vi.mock("../../circle/lib/pinned-answer", () => ({ fetchPostComment: mockFetchPostComment }));

import { fetchReportedContent } from "../lib/reported-content";

const BASE = {
	orgSlug: "club",
	circleMemberId: "cm1",
	postId: "p1",
	commentId: null,
	spaceId: "s1",
};

describe("fetchReportedContent", () => {
	beforeEach(() => vi.clearAllMocks());

	it("reads a post's title, body and author from Circle", async () => {
		mockMemberCircleFetch.mockResolvedValue(
			Response.json({
				id: 1,
				name: "Gallops report",
				body_plain_text: "Going well this week",
				author: { name: "Trainer Tom" },
			}),
		);

		const result = await fetchReportedContent(BASE);

		expect(mockMemberCircleFetch.mock.calls[0][1]).toBe("/spaces/s1/posts/p1");
		expect(result).toMatchObject({
			status: "ok",
			text: expect.stringContaining("Gallops report"),
		});
	});

	it("is not_found on a Circle 404", async () => {
		mockMemberCircleFetch.mockResolvedValue(new Response("", { status: 404 }));
		expect(await fetchReportedContent(BASE)).toEqual({ status: "not_found" });
	});

	it("is an error, not not_found, without a space id (a live post must not look gone)", async () => {
		expect(await fetchReportedContent({ ...BASE, spaceId: null })).toEqual({ status: "error" });
		expect(mockMemberCircleFetch).not.toHaveBeenCalled();
	});

	it("is a transient error when Circle fails or times out", async () => {
		mockMemberCircleFetch.mockResolvedValue(null);
		expect(await fetchReportedContent(BASE)).toEqual({ status: "error" });
	});

	it("reads a comment through the post-scoped comment route", async () => {
		mockFetchPostComment.mockResolvedValue({
			status: "ok",
			comment: { bodyText: "rude words", authorName: "Bob" },
		});

		const result = await fetchReportedContent({ ...BASE, commentId: "c1" });

		expect(mockFetchPostComment).toHaveBeenCalledWith(
			expect.objectContaining({ postId: "p1", commentId: "c1" }),
		);
		expect(result).toEqual({ status: "ok", text: "rude words", authorName: "Bob" });
	});
});
