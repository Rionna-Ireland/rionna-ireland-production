import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));
vi.mock("@repo/database", () => ({
	db: { clubEventMeta: { findUnique: vi.fn(), update: mockUpdate } },
}));
vi.mock("@repo/logs", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../../../circle/lib/member-feed-cache", () => ({ clearMemberFeedCache: vi.fn() }));

import { ensureQuestionsPost } from "../ensure-questions-post";

const createPost = vi.fn();
const run = (extra: { communitySpaceId?: string; qaSpaceId?: string }) =>
	ensureQuestionsPost({
		organizationId: "o1",
		circleEventId: "e1",
		eventName: "Live Q&A",
		circle: { createPost } as never,
		meta: { type: "QA", questionsPostId: null },
		...extra,
	});

describe("ensureQuestionsPost space choice (S13-18)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createPost.mockResolvedValue({ ok: true, data: { circlePostId: "p1" } });
	});

	it("posts into qaSpaceId when set", async () => {
		await run({ qaSpaceId: "qa", communitySpaceId: "ann" });
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ spaceId: "qa" }));
		expect(mockUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ data: { questionsPostId: "p1", questionsSpaceId: "qa" } }),
		);
	});

	it("falls back to communitySpaceId", async () => {
		await run({ communitySpaceId: "ann" });
		expect(createPost).toHaveBeenCalledWith(expect.objectContaining({ spaceId: "ann" }));
	});

	it("does nothing when neither space is configured", async () => {
		await run({});
		expect(createPost).not.toHaveBeenCalled();
	});
});
