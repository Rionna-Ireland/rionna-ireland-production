/**
 * publishMemberPost orchestration tests (S2-09 slice 2)
 *
 * The publish procedure is the fail-safe heart of the composer: resolve the
 * horse's Circle space → serialize the draft → createPost → record the
 * published row. Every Circle failure must NOT throw — it records
 * status="publish_failed" + publishError and returns { ok: false } so the UI
 * can surface the "post directly in Circle" fallback. Exceptional cases
 * (missing post) throw.
 *
 * Serializer + Circle service are mocked here — they have their own suites.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockGetSession,
	mockGetMemberPostById,
	mockUpdateMemberPost,
	mockOrgFindUnique,
	mockParseOrgMetadata,
	mockCreateCircleService,
	mockSerialize,
	mockCreatePost,
	mockNotifyHorseFollowers,
} = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockGetMemberPostById: vi.fn(),
	mockUpdateMemberPost: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockParseOrgMetadata: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockSerialize: vi.fn(),
	mockCreatePost: vi.fn(),
	mockNotifyHorseFollowers: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	getMemberPostById: mockGetMemberPostById,
	updateMemberPost: mockUpdateMemberPost,
	parseOrgMetadata: mockParseOrgMetadata,
	db: { organization: { findUnique: mockOrgFindUnique } },
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: mockCreateCircleService,
	serializeNovelDocToCircle: mockSerialize,
}));

vi.mock("../lib/notify-horse-followers", () => ({
	notifyHorseFollowers: mockNotifyHorseFollowers,
}));

import { publishMemberPost } from "../procedures/publish-member-post";

const ORG = { id: "org1", slug: "rionna", metadata: null };
const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };

const TIPTAP = { body: { type: "doc", content: [] } };

function draftPost(overrides: Record<string, unknown> = {}) {
	return {
		id: "mp1",
		organizationId: "org1",
		audienceType: "horse",
		horseId: "h1",
		updateType: "trainer",
		title: "Trainer update",
		bodyJson: { type: "doc", content: [] },
		videoUrl: null,
		status: "draft",
		circlePostId: null,
		horse: { id: "h1", name: "Pink Diamond Lass", circleSpaceId: "2681063" },
		...overrides,
	};
}

const ctx = { context: { headers: new Headers() } };

describe("publishMemberPost (S2-09)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
		mockOrgFindUnique.mockResolvedValue(ORG);
		mockParseOrgMetadata.mockReturnValue({});
		mockCreateCircleService.mockReturnValue({
			createPost: mockCreatePost,
			uploadImage: vi.fn(),
			createEmbed: vi.fn(),
		});
		mockSerialize.mockResolvedValue({ ok: true, tiptapBody: TIPTAP, attachments: [] });
		mockCreatePost.mockResolvedValue({
			ok: true,
			data: { circlePostId: "5001", status: "published" },
		});
		mockUpdateMemberPost.mockImplementation((id, data) => ({ id, ...data }));
		mockNotifyHorseFollowers.mockResolvedValue(undefined);
	});

	it("publishes a draft to the horse's space and records the published row", async () => {
		mockGetMemberPostById.mockResolvedValue(draftPost());

		const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

		expect(result).toMatchObject({ ok: true, circlePostId: "5001" });
		expect(mockCreatePost).toHaveBeenCalledWith({
			spaceId: "2681063",
			name: "Trainer update",
			tiptapBody: TIPTAP,
			attachments: [],
			idempotencyKey: "mp1",
		});
		expect(mockUpdateMemberPost).toHaveBeenCalledWith("mp1", {
			status: "published",
			circlePostId: "5001",
			circleSpaceId: "2681063",
			publishedAt: expect.any(Date),
			publishError: null,
		});
	});

	it("fails safe (no throw) when serialization fails", async () => {
		mockGetMemberPostById.mockResolvedValue(draftPost());
		mockSerialize.mockResolvedValue({ ok: false, reason: "server_error" });

		const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

		expect(result).toMatchObject({ ok: false, reason: "server_error" });
		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockUpdateMemberPost).toHaveBeenCalledWith(
			"mp1",
			expect.objectContaining({ status: "publish_failed", publishError: expect.any(String) }),
		);
	});

	it("fails safe when the Circle createPost call fails", async () => {
		mockGetMemberPostById.mockResolvedValue(draftPost());
		mockCreatePost.mockResolvedValue({ ok: false, reason: "rate_limited", retriable: true });

		const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

		expect(result).toMatchObject({ ok: false, reason: "rate_limited" });
		expect(mockUpdateMemberPost).toHaveBeenCalledWith(
			"mp1",
			expect.objectContaining({ status: "publish_failed" }),
		);
	});

	it("fails safe when the horse has no Circle space yet (no Circle calls)", async () => {
		mockGetMemberPostById.mockResolvedValue(
			draftPost({ horse: { id: "h1", name: "Pink Diamond Lass", circleSpaceId: null } }),
		);

		const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

		expect(result).toMatchObject({ ok: false, reason: "no_circle_space" });
		expect(mockCreateCircleService).not.toHaveBeenCalled();
		expect(mockSerialize).not.toHaveBeenCalled();
		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockUpdateMemberPost).toHaveBeenCalledWith(
			"mp1",
			expect.objectContaining({ status: "publish_failed" }),
		);
	});

	it("is idempotent: an already-published post returns its circlePostId without re-posting", async () => {
		mockGetMemberPostById.mockResolvedValue(
			draftPost({ status: "published", circlePostId: "9999" }),
		);

		const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

		expect(result).toMatchObject({ ok: true, circlePostId: "9999" });
		expect(mockCreatePost).not.toHaveBeenCalled();
		expect(mockUpdateMemberPost).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND when the post does not exist", async () => {
		mockGetMemberPostById.mockResolvedValue(null);

		await expect(call(publishMemberPost, { memberPostId: "nope" }, ctx)).rejects.toThrow();
		expect(mockCreatePost).not.toHaveBeenCalled();
	});

	describe("notifyFollowers (S8-01a2)", () => {
		it("notifies the horse's followers when notifyFollowers is set on a wellbeing update", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost({ updateType: "wellbeing" }));

			await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

			expect(mockNotifyHorseFollowers).toHaveBeenCalledWith({
				organizationId: "org1",
				horseId: "h1",
				memberPostId: "mp1",
				title: "Trainer update",
				horseName: "Pink Diamond Lass",
			});
		});

		it("does not notify when notifyFollowers is omitted", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost({ updateType: "wellbeing" }));

			await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
		});

		it("does not notify a non-wellbeing update even when notifyFollowers is set", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost({ updateType: "trainer" }));

			await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
		});

		it("does not notify a community post even when notifyFollowers is set", async () => {
			mockGetMemberPostById.mockResolvedValue(
				draftPost({ audienceType: "community", updateType: "wellbeing", horseId: null, horse: null }),
			);

			await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
		});

		it("does not notify when publish fails safe", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost({ updateType: "wellbeing" }));
			mockCreatePost.mockResolvedValue({ ok: false, reason: "rate_limited", retriable: true });

			await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
		});

		it("does not notify on the idempotent already-published short-circuit", async () => {
			mockGetMemberPostById.mockResolvedValue(
				draftPost({ status: "published", circlePostId: "9999", updateType: "wellbeing" }),
			);

			await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
		});
	});
});
