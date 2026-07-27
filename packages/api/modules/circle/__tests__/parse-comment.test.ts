import { describe, expect, it } from "vitest";

import { extractComments, toPostComment } from "../lib/parse-comment";

function commentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 9001,
		post_id: 34775788,
		space_id: 2714507,
		parent_comment_id: null,
		replies_count: 0,
		replies: [],
		body: { attachments: {}, html: "<p>Great run today!</p>" },
		body_text: "Great run today!",
		tiptap_body: null,
		is_liked: false,
		user_likes_count: 2,
		created_at: "2026-07-27T10:00:00.000Z",
		author: {
			id: 2,
			community_member_id: 84197448,
			name: "Jane Member",
			avatar_url: "https://cdn.example/jane.png",
			roles: [],
		},
		policies: { can_bookmark: true, can_destroy: true, can_edit: true, can_report: false },
		...overrides,
	};
}

describe("toPostComment", () => {
	it("parses a full comment record", () => {
		const comment = toPostComment(commentRecord());
		expect(comment).toEqual({
			id: "9001",
			parentCommentId: null,
			bodyText: "Great run today!",
			tiptapDoc: null,
			authorName: "Jane Member",
			authorAvatarUrl: "https://cdn.example/jane.png",
			createdAt: "2026-07-27T10:00:00.000Z",
			likeCount: 2,
			isLiked: false,
			canDelete: true,
			replies: [],
		});
	});

	it("parses one level of nested replies with their parent id", () => {
		const comment = toPostComment(
			commentRecord({
				replies_count: 1,
				replies: [
					commentRecord({
						id: 9002,
						parent_comment_id: 9001,
						body_text: "Agreed!",
						policies: { can_destroy: false },
					}),
				],
			}),
		);
		expect(comment?.replies).toHaveLength(1);
		expect(comment?.replies[0]).toMatchObject({
			id: "9002",
			parentCommentId: "9001",
			bodyText: "Agreed!",
			canDelete: false,
		});
	});

	it("falls back to the tiptap doc text when body_text is missing", () => {
		const tiptapDoc = {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text: "From tiptap" }] }],
		};
		const comment = toPostComment(
			commentRecord({
				body_text: null,
				body: null,
				tiptap_body: { body: tiptapDoc },
			}),
		);
		expect(comment?.bodyText).toBe("From tiptap");
		expect(comment?.tiptapDoc).toEqual(tiptapDoc);
	});

	it("defaults defensively on a sparse record and drops id-less records", () => {
		expect(toPostComment({ id: 1 })).toEqual({
			id: "1",
			parentCommentId: null,
			bodyText: null,
			tiptapDoc: null,
			authorName: null,
			authorAvatarUrl: null,
			createdAt: null,
			likeCount: 0,
			isLiked: false,
			canDelete: false,
			replies: [],
		});
		expect(toPostComment({})).toBeNull();
		expect(toPostComment({ name: "no id here" })).toBeNull();
	});

	it("treats non-boolean is_liked / non-numeric counts as defaults", () => {
		const comment = toPostComment(
			commentRecord({ is_liked: "yes", user_likes_count: "2", policies: "broken" }),
		);
		expect(comment).toMatchObject({ isLiked: false, likeCount: 0, canDelete: false });
	});
});

describe("extractComments", () => {
	it("reads the paginated {records} envelope", () => {
		const comments = extractComments({
			page: 1,
			per_page: 60,
			has_next_page: false,
			count: 2,
			records: [commentRecord(), commentRecord({ id: 9002 })],
		});
		expect(comments.map((comment) => comment.id)).toEqual(["9001", "9002"]);
	});

	it("tolerates a bare array (the /spaces lesson)", () => {
		const comments = extractComments([commentRecord()]);
		expect(comments).toHaveLength(1);
	});

	it("returns [] for junk payloads and skips unparseable records", () => {
		expect(extractComments(null)).toEqual([]);
		expect(extractComments("nope")).toEqual([]);
		expect(extractComments({ records: [{ no_id: true }, commentRecord()] })).toHaveLength(1);
	});
});
