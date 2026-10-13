import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
	getSession: vi.fn(),
	orgFind: vi.fn(),
	memberFindFirst: vi.fn(),
	memberFindMany: vi.fn(),
	trainerFindMany: vi.fn(),
	trainerFindFirst: vi.fn(),
	trainerUpdate: vi.fn(),
	attrUpsert: vi.fn(),
	attrDeleteMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: m.getSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: m.orgFind },
		member: { findFirst: m.memberFindFirst, findMany: m.memberFindMany },
		trainer: {
			findMany: m.trainerFindMany,
			findFirst: m.trainerFindFirst,
			update: m.trainerUpdate,
		},
		postAttribution: { upsert: m.attrUpsert, deleteMany: m.attrDeleteMany },
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

import { attributePost } from "../../community/procedures/admin/attribute-post";
import { updateTrainer } from "../../racing/horses/procedures/update-trainer";
import { getPostComments } from "../procedures/get-post-comments";

const ctx = { context: { headers: new Headers() } };
const ADMIN = { id: "uA", role: "admin" };
const SESSION = { id: "s", activeOrganizationId: "org1" };

beforeEach(() => {
	vi.clearAllMocks();
	m.getSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	m.orgFind.mockResolvedValue({ id: "org1", slug: "rionna" });
	m.memberFindFirst.mockResolvedValue({ circleMemberId: "900" });
	m.memberFindMany.mockResolvedValue([]);
	m.trainerFindMany.mockResolvedValue([]);
});

describe("getPostComments authorRole", () => {
	it("stamps roles on comments and replies with one batched lookup; real author kept", async () => {
		m.memberFindMany.mockResolvedValue([
			{ circleMemberId: "501", userId: "uT", role: "member" },
			{ circleMemberId: "502", userId: "uS", role: "owner" },
		]);
		m.trainerFindMany.mockResolvedValue([{ userId: "uT" }]);
		const comment = (id: number, member: number, replies: unknown[] = []) => ({
			id,
			name: "x",
			author: { community_member_id: member, name: `Member ${member}` },
			replies,
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					records: [comment(1, 501, [comment(2, 502)]), comment(3, 777)],
					has_next_page: false,
				}),
			})),
		);
		const res = await call(getPostComments, { organizationId: "org1", postId: "10" }, ctx);
		expect(res.comments[0]).toMatchObject({ authorRole: "trainer", authorName: "Member 501" });
		expect(res.comments[0]?.replies[0]).toMatchObject({ authorRole: "staff" });
		expect(res.comments[1]).toMatchObject({ authorRole: null });
		expect(m.memberFindMany).toHaveBeenCalledTimes(1);
	});
});

describe("attributePost", () => {
	it("upserts an attribution for a trainer in this org", async () => {
		m.trainerFindFirst.mockResolvedValue({ id: "t1" });
		const res = await call(
			attributePost,
			{ organizationId: "org1", circlePostId: "55", trainerId: "t1" },
			ctx,
		);
		expect(res).toEqual({ ok: true });
		expect(m.attrUpsert).toHaveBeenCalledWith(
			expect.objectContaining({ where: { circlePostId: "55" }, update: { trainerId: "t1" } }),
		);
	});

	it("clears the attribution with trainerId null and rejects unknown trainers", async () => {
		await call(attributePost, { organizationId: "org1", circlePostId: "55", trainerId: null }, ctx);
		expect(m.attrDeleteMany).toHaveBeenCalled();
		m.trainerFindFirst.mockResolvedValue(null);
		await expect(
			call(attributePost, { organizationId: "org1", circlePostId: "55", trainerId: "nope" }, ctx),
		).rejects.toThrow();
	});
});

describe("updateTrainer", () => {
	beforeEach(() => {
		m.trainerFindFirst.mockResolvedValueOnce({ id: "t1", meta: { foo: 1 } });
		m.trainerUpdate.mockResolvedValue({ id: "t1" });
	});

	it("links a member's account", async () => {
		m.memberFindFirst.mockResolvedValue({ id: "mem" });
		m.trainerFindFirst.mockResolvedValueOnce(null); // not already linked elsewhere
		const res = await call(
			updateTrainer,
			{ organizationId: "org1", trainerId: "t1", userId: "uT" },
			ctx,
		);
		expect(res).toMatchObject({ ok: true });
		expect(m.trainerUpdate).toHaveBeenCalledWith({ where: { id: "t1" }, data: { userId: "uT" } });
	});

	it("refuses a non-member and an account already linked to another trainer", async () => {
		m.memberFindFirst.mockResolvedValueOnce(null);
		expect(
			await call(updateTrainer, { organizationId: "org1", trainerId: "t1", userId: "x" }, ctx),
		).toEqual({ ok: false, reason: "not_a_member" });

		m.trainerFindFirst.mockResolvedValueOnce({ id: "t1", meta: null });
		m.memberFindFirst.mockResolvedValueOnce({ id: "mem" });
		m.trainerFindFirst.mockResolvedValueOnce({ id: "t2" });
		expect(
			await call(updateTrainer, { organizationId: "org1", trainerId: "t1", userId: "uT" }, ctx),
		).toEqual({ ok: false, reason: "already_linked" });
		expect(m.trainerUpdate).not.toHaveBeenCalled();
	});

	it("merges avatarUrl into meta", async () => {
		await call(
			updateTrainer,
			{ organizationId: "org1", trainerId: "t1", avatarUrl: "https://x/a.png" },
			ctx,
		);
		expect(m.trainerUpdate).toHaveBeenCalledWith({
			where: { id: "t1" },
			data: { meta: { foo: 1, avatarUrl: "https://x/a.png" } },
		});
	});
});
