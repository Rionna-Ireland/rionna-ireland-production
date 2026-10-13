import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	getSession: vi.fn(),
	orgFind: vi.fn(),
	memberFindFirst: vi.fn(),
	memberFindMany: vi.fn(),
	trainerFindFirst: vi.fn(),
	trainerFindMany: vi.fn(),
	pinFind: vi.fn(),
	pinUpsert: vi.fn(),
	pinDeleteMany: vi.fn(),
	attrFindMany: vi.fn(),
	onAnswerPinned: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: m.orgFind },
		member: { findFirst: m.memberFindFirst, findMany: m.memberFindMany },
		trainer: { findFirst: m.trainerFindFirst, findMany: m.trainerFindMany },
		pinnedAnswer: {
			findUnique: m.pinFind,
			upsert: m.pinUpsert,
			deleteMany: m.pinDeleteMany,
		},
		commentAttribution: { findMany: m.attrFindMany },
		postAttribution: { findMany: vi.fn(async () => []) },
	},
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({
		getMemberToken: vi.fn(async () => ({ ok: true, data: { accessToken: "jwt" } })),
	})),
	getCircleHeadlessApiBaseUrl: vi.fn(() => "https://app.circle.so/api/headless/v1"),
}));
vi.mock("../../inbox/activity-hooks", () => ({ onAnswerPinned: m.onAnswerPinned }));

import { pinAnswer, unpinAnswer } from "../../community/procedures/pinned-answer";
import { getPostComments } from "../procedures/get-post-comments";
import { splitPinnedComment } from "../lib/pinned-answer";

const ctx = { context: { headers: new Headers() } };
const USER = { id: "u1", role: null };
const SESSION = { id: "s", activeOrganizationId: "org1" };
const ORG = { organizationId: "org1" };

const record = (id: number, member: number, replies: unknown[] = []) => ({
	id,
	body: `body ${id}`,
	author: { community_member_id: member, name: `Member ${member}` },
	replies,
});

function stubFetch(handler: (url: string) => { status: number; body?: unknown }) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const r = handler(url);
			return { ok: r.status < 400, status: r.status, json: async () => r.body };
		}),
	);
}

/** The viewer's membership row: plain member unless overridden. */
function viewer(over: Record<string, unknown> = {}) {
	m.memberFindFirst.mockResolvedValue({
		circleMemberId: "900",
		role: "member",
		user: { role: null, expertLabel: null },
		organization: { slug: "rionna" },
		...over,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	m.getSession.mockResolvedValue({ user: USER, session: SESSION });
	m.orgFind.mockResolvedValue({ id: "org1", slug: "rionna" });
	m.memberFindMany.mockResolvedValue([]);
	m.trainerFindMany.mockResolvedValue([]);
	m.trainerFindFirst.mockResolvedValue(null);
	m.attrFindMany.mockResolvedValue([]);
	m.pinFind.mockResolvedValue(null);
	m.pinUpsert.mockResolvedValue({});
	m.pinDeleteMany.mockResolvedValue({ count: 1 });
	viewer();
});

describe("splitPinnedComment", () => {
	type C = import("../lib/parse-comment").PostComment;
	const c = (id: string, replies: C[] = []) => ({ id, replies }) as unknown as C;

	it("removes a top-level pin and keeps its replies nested under it", () => {
		const out = splitPinnedComment([c("1"), c("2", [c("3")])], "2");
		expect(out.comments.map((x) => x.id)).toEqual(["1"]);
		expect(out.pinned?.replies.map((x) => x.id)).toEqual(["3"]);
	});

	it("removes a pinned reply from its parent", () => {
		const out = splitPinnedComment([c("1", [c("9")])], "9");
		expect(out.pinned?.id).toBe("9");
		expect(out.comments[0]?.replies).toEqual([]);
	});
});

describe("pin role gate", () => {
	it("rejects plain members for pin and unpin", async () => {
		stubFetch(() => ({ status: 200, body: record(5, 1) }));
		await expect(call(pinAnswer, { ...ORG, postId: "10", commentId: "5" }, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		await expect(call(unpinAnswer, { ...ORG, postId: "10" }, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(m.pinUpsert).not.toHaveBeenCalled();
		expect(m.pinDeleteMany).not.toHaveBeenCalled();
	});

	it.each([
		["staff (org admin)", { role: "admin" }],
		["global admin user", { user: { role: "admin", expertLabel: null } }],
		["expert", { user: { role: null, expertLabel: "vet" } }],
	])("allows %s", async (_name, over) => {
		viewer(over);
		stubFetch(() => ({ status: 200, body: record(5, 1) }));
		await call(pinAnswer, { ...ORG, postId: "10", commentId: "5" }, ctx);
		expect(m.pinUpsert).toHaveBeenCalled();
	});

	it("allows a linked trainer", async () => {
		m.trainerFindFirst.mockResolvedValue({ id: "t1" });
		stubFetch(() => ({ status: 200, body: record(5, 1) }));
		await call(pinAnswer, { ...ORG, postId: "10", commentId: "5" }, ctx);
		expect(m.pinUpsert).toHaveBeenCalled();
	});
});

describe("pinAnswer", () => {
	beforeEach(() => viewer({ role: "admin" }));

	it("rejects a comment that does not belong to the post (Circle 404)", async () => {
		stubFetch(() => ({ status: 404 }));
		await expect(call(pinAnswer, { ...ORG, postId: "10", commentId: "99" }, ctx)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(m.pinUpsert).not.toHaveBeenCalled();
	});

	it("verifies via the post-scoped comment route and notifies the post author", async () => {
		const spy = vi.fn((_url: string) => ({ status: 200, body: record(5, 1) }));
		stubFetch(spy);
		await call(pinAnswer, { ...ORG, postId: "10", commentId: "5" }, ctx);
		expect(spy.mock.calls[0]?.[0]).toContain("/posts/10/comments/5");
		expect(m.pinUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ where: { circlePostId: "10" } }),
		);
		expect(m.onAnswerPinned).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org1",
				circlePostId: "10",
				pinner: { userId: "u1" },
				answererName: "Member 1",
			}),
		);
	});

	it("does not re-notify when the same comment is pinned again", async () => {
		m.pinFind.mockResolvedValue({ organizationId: "org1", circleCommentId: "5" });
		stubFetch(() => ({ status: 200, body: record(5, 1) }));
		await call(pinAnswer, { ...ORG, postId: "10", commentId: "5" }, ctx);
		expect(m.onAnswerPinned).not.toHaveBeenCalled();
	});

	it("unpin deletes the row for staff", async () => {
		await call(unpinAnswer, { ...ORG, postId: "10" }, ctx);
		expect(m.pinDeleteMany).toHaveBeenCalledWith({
			where: { organizationId: "org1", circlePostId: "10" },
		});
	});
});

describe("getPostComments pinned answer", () => {
	it("moves the pinned comment out of the list and reports canPin", async () => {
		viewer({ role: "admin" });
		m.pinFind.mockResolvedValue({ id: "pin1", organizationId: "org1", circleCommentId: "2" });
		stubFetch(() => ({
			status: 200,
			body: { records: [record(1, 1), record(2, 2, [record(3, 3)])], has_next_page: false, count: 3 },
		}));
		const res = await call(getPostComments, { organizationId: "org1", postId: "10" }, ctx);
		expect(res.comments.map((c) => c.id)).toEqual(["1"]);
		expect(res.pinnedAnswer?.id).toBe("2");
		expect(res.pinnedAnswer?.replies.map((r) => r.id)).toEqual(["3"]);
		expect(res.totalCount).toBe(3);
		expect(res.canPin).toBe(true);
	});

	it("members get canPin false", async () => {
		stubFetch(() => ({ status: 200, body: { records: [record(1, 1)], has_next_page: false } }));
		const res = await call(getPostComments, { organizationId: "org1", postId: "10" }, ctx);
		expect(res.canPin).toBe(false);
		expect(res.pinnedAnswer).toBeNull();
	});

	it("fetches a pinned comment that is not on page 1 and stamps expert role + label", async () => {
		m.pinFind.mockResolvedValue({ id: "pin1", organizationId: "org1", circleCommentId: "77" });
		m.memberFindMany.mockResolvedValue([
			{ circleMemberId: "5", userId: "uE", role: "member", user: { role: null, expertLabel: "vet" } },
		]);
		stubFetch((url) =>
			url.includes("/comments/77")
				? { status: 200, body: { comment: record(77, 5) } }
				: { status: 200, body: { records: [record(1, 1)], has_next_page: true } },
		);
		const res = await call(getPostComments, { organizationId: "org1", postId: "10" }, ctx);
		expect(res.pinnedAnswer).toMatchObject({ id: "77", authorRole: "expert", authorRoleLabel: "vet" });
		expect(res.comments.map((c) => c.id)).toEqual(["1"]);
	});

	it("deletes a stale pin when the comment is gone and fails open", async () => {
		m.pinFind.mockResolvedValue({ id: "pin1", organizationId: "org1", circleCommentId: "77" });
		stubFetch((url) =>
			url.includes("/comments/77")
				? { status: 404 }
				: { status: 200, body: { records: [record(1, 1)], has_next_page: false } },
		);
		const res = await call(getPostComments, { organizationId: "org1", postId: "10" }, ctx);
		expect(res.pinnedAnswer).toBeNull();
		expect(res.ok).toBe(true);
		expect(m.pinDeleteMany).toHaveBeenCalledWith({ where: { id: "pin1" } });
	});

	it("keeps the pin on a transient fetch error", async () => {
		m.pinFind.mockResolvedValue({ id: "pin1", organizationId: "org1", circleCommentId: "77" });
		stubFetch((url) =>
			url.includes("/comments/77")
				? { status: 500 }
				: { status: 200, body: { records: [record(1, 1)], has_next_page: false } },
		);
		const res = await call(getPostComments, { organizationId: "org1", postId: "10" }, ctx);
		expect(res.pinnedAnswer).toBeNull();
		expect(m.pinDeleteMany).not.toHaveBeenCalled();
	});

	it("swaps a trainer-attributed comment to the trainer and keeps the real author id", async () => {
		m.attrFindMany.mockResolvedValue([
			{ circleCommentId: "1", trainer: { name: "Ger Byrne", meta: null, user: { image: "a.png" } } },
		]);
		stubFetch(() => ({ status: 200, body: { records: [record(1, 900)], has_next_page: false } }));
		const res = await call(getPostComments, { organizationId: "org1", postId: "10" }, ctx);
		expect(res.comments[0]).toMatchObject({
			authorName: "Ger Byrne",
			authorAvatarUrl: "a.png",
			authorRole: "trainer",
			authorCircleMemberId: "900",
		});
	});
});
