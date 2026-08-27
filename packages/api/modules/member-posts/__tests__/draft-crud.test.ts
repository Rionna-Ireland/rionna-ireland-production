/**
 * Member-post draft CRUD tests (S2-09 slice 2)
 *
 * Thin admin procedures over the member_post query helpers: create (author +
 * draft default, horse updates require a horseId), update (draft-only, partial),
 * get, and list (org-scoped, status filter). DB layer is mocked.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockCreate, mockUpdate, mockGetById, mockList } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockCreate: vi.fn(),
	mockUpdate: vi.fn(),
	mockGetById: vi.fn(),
	mockList: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	createMemberPost: mockCreate,
	updateMemberPost: mockUpdate,
	getMemberPostById: mockGetById,
	getMemberPosts: mockList,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { createMemberPostDraft } from "../procedures/create-member-post-draft";
import { getMemberPost } from "../procedures/get-member-post";
import { listMemberPosts } from "../procedures/list-member-posts";
import { updateMemberPostDraft } from "../procedures/update-member-post-draft";

const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
});

describe("member-post draft CRUD (S2-09)", () => {
	it("creates a horse-update draft with the author attached", async () => {
		mockCreate.mockImplementation(async (d: Record<string, unknown>) => ({ id: "mp1", ...d }));

		const result = await call(
			createMemberPostDraft,
			{
				organizationId: "org1",
				audienceType: "horse",
				horseId: "h1",
				updateType: "trainer",
				title: "Worked well",
				bodyJson: { type: "doc", content: [] },
			},
			ctx,
		);

		expect(result).toMatchObject({ id: "mp1" });
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org1",
				authorUserId: "u1",
				audienceType: "horse",
				horseId: "h1",
				updateType: "trainer",
				title: "Worked well",
			}),
		);
	});

	it("rejects a horse update with no horseId", async () => {
		await expect(
			call(
				createMemberPostDraft,
				{ organizationId: "org1", audienceType: "horse", title: "x" },
				ctx,
			),
		).rejects.toThrow();
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("accepts an insideTrack draft with no horse", async () => {
		mockCreate.mockImplementation(async (d: Record<string, unknown>) => ({ id: "mp2", ...d }));

		const result = await call(
			createMemberPostDraft,
			{
				organizationId: "org1",
				audienceType: "insideTrack",
				title: "How to read a racecard",
				bodyJson: { type: "doc", content: [] },
			},
			ctx,
		);

		expect(result).toMatchObject({ id: "mp2" });
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org1",
				authorUserId: "u1",
				audienceType: "insideTrack",
				horseId: null,
				updateType: null,
				title: "How to read a racecard",
			}),
		);
	});

	it("rejects an insideTrack draft carrying a horseId", async () => {
		await expect(
			call(
				createMemberPostDraft,
				{
					organizationId: "org1",
					audienceType: "insideTrack",
					horseId: "h1",
					title: "x",
				},
				ctx,
			),
		).rejects.toThrow();
		expect(mockCreate).not.toHaveBeenCalled();
	});

	it("updates only the provided draft fields", async () => {
		mockGetById.mockResolvedValue({ id: "mp1", status: "draft" });
		mockUpdate.mockImplementation(async (id: string, d: Record<string, unknown>) => ({
			id,
			...d,
		}));

		await call(updateMemberPostDraft, { memberPostId: "mp1", title: "New title" }, ctx);

		expect(mockUpdate).toHaveBeenCalledWith("mp1", { title: "New title" });
	});

	it("refuses to edit an already-published post", async () => {
		mockGetById.mockResolvedValue({ id: "mp1", status: "published" });

		await expect(
			call(updateMemberPostDraft, { memberPostId: "mp1", title: "x" }, ctx),
		).rejects.toThrow();
		expect(mockUpdate).not.toHaveBeenCalled();
	});

	it("gets a post by id", async () => {
		mockGetById.mockResolvedValue({ id: "mp1", title: "T" });

		const result = await call(getMemberPost, { memberPostId: "mp1" }, ctx);

		expect(result).toMatchObject({ id: "mp1" });
	});

	it("lists posts for an org with a status filter and defaults", async () => {
		mockList.mockResolvedValue([{ id: "mp1" }]);

		const result = await call(
			listMemberPosts,
			{ organizationId: "org1", status: "draft" },
			ctx,
		);

		expect(result).toEqual([{ id: "mp1" }]);
		expect(mockList).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: "org1",
				status: "draft",
				limit: 20,
				offset: 0,
			}),
		);
	});
});
