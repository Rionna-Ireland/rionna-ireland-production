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
	mockNotifyCommunityMembers,
	mockNotifyInsideTrackMembers,
	mockInvalidateInsideTrackCache,
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
	mockNotifyCommunityMembers: vi.fn(),
	mockNotifyInsideTrackMembers: vi.fn(),
	mockInvalidateInsideTrackCache: vi.fn(),
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

vi.mock("../lib/notify-community-members", () => ({
	notifyCommunityMembers: mockNotifyCommunityMembers,
}));

vi.mock("../lib/notify-inside-track-members", () => ({
	notifyInsideTrackMembers: mockNotifyInsideTrackMembers,
}));

vi.mock("../../circle/lib/inside-track-cache", () => ({
	invalidateInsideTrackCache: mockInvalidateInsideTrackCache,
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
		mockNotifyCommunityMembers.mockResolvedValue(undefined);
		mockNotifyInsideTrackMembers.mockResolvedValue(undefined);
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

	describe("notifyFollowers (S8-01a3)", () => {
		it.each(["race", "trainer", "wellbeing", "general"] as const)(
			"notifies the horse's followers when notifyFollowers is set on a %s update",
			async (updateType) => {
				mockGetMemberPostById.mockResolvedValue(draftPost({ updateType }));

				await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

				expect(mockNotifyHorseFollowers).toHaveBeenCalledWith({
					organizationId: "org1",
					horseId: "h1",
					memberPostId: "mp1",
					title: "Trainer update",
					horseName: "Pink Diamond Lass",
					updateType,
				});
			},
		);

		it("does not notify when notifyFollowers is omitted", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost({ updateType: "wellbeing" }));

			await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
		});

		it("does not notify horse followers for a community post even when notifyFollowers is set", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { communitySpaceId: "2695457", communityDomain: "rionna.circle.so" },
			});
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "community",
					updateType: "wellbeing",
					horseId: null,
					horse: null,
				}),
			);

			await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
			expect(mockNotifyCommunityMembers).not.toHaveBeenCalled();
		});

		it("notifies all members when notifyMembers is set on a community announcement", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { communitySpaceId: "2695457", communityDomain: "rionna.circle.so" },
			});
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "community",
					title: "Club dinner Friday",
					horseId: null,
					horse: null,
				}),
			);

			await call(publishMemberPost, { memberPostId: "mp1", notifyMembers: true }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
			expect(mockNotifyCommunityMembers).toHaveBeenCalledWith({
				organizationId: "org1",
				memberPostId: "mp1",
				title: "Club dinner Friday",
				circlePostUrl: "https://rionna.circle.so/posts/5001",
			});
		});

		it("does not notify members when notifyMembers is omitted on a community announcement", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { communitySpaceId: "2695457" },
			});
			mockGetMemberPostById.mockResolvedValue(
				draftPost({ audienceType: "community", horseId: null, horse: null }),
			);

			await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(mockNotifyCommunityMembers).not.toHaveBeenCalled();
		});

		it("does not notify members when notifyMembers is set on a horse update", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost({ updateType: "trainer" }));

			await call(publishMemberPost, { memberPostId: "mp1", notifyMembers: true }, ctx);

			expect(mockNotifyCommunityMembers).not.toHaveBeenCalled();
			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
		});

		it("does not notify when publish fails safe", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost({ updateType: "wellbeing" }));
			mockCreatePost.mockResolvedValue({
				ok: false,
				reason: "rate_limited",
				retriable: true,
			});

			await call(publishMemberPost, { memberPostId: "mp1", notifyFollowers: true }, ctx);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
			expect(mockNotifyCommunityMembers).not.toHaveBeenCalled();
		});

		it("does not notify on the idempotent already-published short-circuit", async () => {
			mockGetMemberPostById.mockResolvedValue(
				draftPost({ status: "published", circlePostId: "9999", updateType: "wellbeing" }),
			);

			await call(
				publishMemberPost,
				{ memberPostId: "mp1", notifyFollowers: true, notifyMembers: true },
				ctx,
			);

			expect(mockNotifyHorseFollowers).not.toHaveBeenCalled();
			expect(mockNotifyCommunityMembers).not.toHaveBeenCalled();
		});
	});

	describe("insideTrack audience (S11-01)", () => {
		it("publishes an insideTrack post to metadata.circle.insideTrack.spaceId", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { insideTrack: { spaceId: "space_it" } },
			});
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "insideTrack",
					title: "How to read a racecard",
					horseId: null,
					updateType: null,
					horse: null,
				}),
			);

			const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(result).toMatchObject({ ok: true, circlePostId: "5001" });
			expect(mockCreatePost).toHaveBeenCalledWith(
				expect.objectContaining({ spaceId: "space_it" }),
			);
		});

		it("invalidates the Inside Track cache after a successful insideTrack publish", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { insideTrack: { spaceId: "space_it" } },
			});
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "insideTrack",
					title: "How to read a racecard",
					horseId: null,
					updateType: null,
					horse: null,
				}),
			);

			await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(mockInvalidateInsideTrackCache).toHaveBeenCalledWith("org1");
			expect(mockInvalidateInsideTrackCache).toHaveBeenCalledTimes(1);
		});

		it("does not invalidate the Inside Track cache for a horse or community publish", async () => {
			mockGetMemberPostById.mockResolvedValue(draftPost());

			await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(mockInvalidateInsideTrackCache).not.toHaveBeenCalled();
		});

		it("does not invalidate the Inside Track cache when the insideTrack publish fails safe", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { insideTrack: { spaceId: "space_it" } },
			});
			mockCreatePost.mockResolvedValue({ ok: false, reason: "rate_limited", retriable: true });
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "insideTrack",
					title: "How to read a racecard",
					horseId: null,
					updateType: null,
					horse: null,
				}),
			);

			const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(result).toMatchObject({ ok: false });
			expect(mockInvalidateInsideTrackCache).not.toHaveBeenCalled();
		});

		it("fails safe when no insideTrack space is configured", async () => {
			mockParseOrgMetadata.mockReturnValue({ circle: {} });
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "insideTrack",
					title: "How to read a racecard",
					horseId: null,
					updateType: null,
					horse: null,
				}),
			);

			const result = await call(publishMemberPost, { memberPostId: "mp1" }, ctx);

			expect(result).toMatchObject({ ok: false, reason: "no_circle_space" });
			expect(mockCreateCircleService).not.toHaveBeenCalled();
			expect(mockCreatePost).not.toHaveBeenCalled();
			expect(mockUpdateMemberPost).toHaveBeenCalledWith(
				"mp1",
				expect.objectContaining({ status: "publish_failed" }),
			);
		});

		it("fires notifyInsideTrackMembers when notifyMembers is true", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { insideTrack: { spaceId: "space_it" } },
			});
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "insideTrack",
					title: "How to read a racecard",
					horseId: null,
					updateType: null,
					horse: null,
				}),
			);

			await call(publishMemberPost, { memberPostId: "mp1", notifyMembers: true }, ctx);

			expect(mockNotifyInsideTrackMembers).toHaveBeenCalledWith({
				organizationId: "org1",
				memberPostId: "mp1",
				title: "How to read a racecard",
			});
		});

		it("does not fire notifyInsideTrackMembers when notifyMembers is false", async () => {
			mockParseOrgMetadata.mockReturnValue({
				circle: { insideTrack: { spaceId: "space_it" } },
			});
			mockGetMemberPostById.mockResolvedValue(
				draftPost({
					audienceType: "insideTrack",
					title: "How to read a racecard",
					horseId: null,
					updateType: null,
					horse: null,
				}),
			);

			await call(publishMemberPost, { memberPostId: "mp1", notifyMembers: false }, ctx);

			expect(mockNotifyInsideTrackMembers).not.toHaveBeenCalled();
		});
	});
});
