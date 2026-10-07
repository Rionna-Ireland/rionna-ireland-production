/**
 * S13-13: admin-entered Inside Track video length (InsideTrackMeta).
 * Org-scoped (active org must match), upserts/clears one row, invalidates the
 * Inside Track cache and emits a structured audit log.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockUpsert, mockDeleteMany, mockFindMany, mockLoggerInfo, mockInvalidate } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockUpsert: vi.fn(),
		mockDeleteMany: vi.fn(),
		mockFindMany: vi.fn(),
		mockLoggerInfo: vi.fn(),
		mockInvalidate: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		insideTrackMeta: { upsert: mockUpsert, deleteMany: mockDeleteMany, findMany: mockFindMany },
	},
}));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));
vi.mock("../../circle/lib/inside-track-cache", () => ({
	invalidateInsideTrackCache: mockInvalidate,
}));

import { listInsideTrackVideoDurations } from "../procedures/list-inside-track-video-durations";
import { setInsideTrackVideoDuration } from "../procedures/set-inside-track-video-duration";

const ORG_ID = "org1";
const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const ctx = { context: { headers: new Headers() } };

describe("setInsideTrackVideoDuration (S13-13)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({
			user: ADMIN,
			session: { id: "s1", activeOrganizationId: ORG_ID },
		});
		mockUpsert.mockResolvedValue({});
		mockDeleteMany.mockResolvedValue({ count: 1 });
	});

	it("upserts the seconds, invalidates the cache and audit-logs", async () => {
		const res = await call(
			setInsideTrackVideoDuration,
			{ organizationId: ORG_ID, circlePostId: "p1", videoDurationSeconds: 240 },
			ctx,
		);
		expect(res).toEqual({ circlePostId: "p1", videoDurationSeconds: 240 });
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { circlePostId: "p1" },
			create: { organizationId: ORG_ID, circlePostId: "p1", videoDurationSeconds: 240 },
			update: { videoDurationSeconds: 240 },
		});
		expect(mockInvalidate).toHaveBeenCalledWith(ORG_ID);
		expect(mockLoggerInfo).toHaveBeenCalledWith(
			"Admin set Inside Track video length",
			expect.objectContaining({
				event: "admin_inside_track_video_duration_set",
				actorUserId: "u1",
				organizationId: ORG_ID,
				circlePostId: "p1",
				videoDurationSeconds: 240,
			}),
		);
	});

	it("clears the override when seconds is null", async () => {
		await call(
			setInsideTrackVideoDuration,
			{ organizationId: ORG_ID, circlePostId: "p1", videoDurationSeconds: null },
			ctx,
		);
		expect(mockDeleteMany).toHaveBeenCalledWith({
			where: { organizationId: ORG_ID, circlePostId: "p1" },
		});
		expect(mockUpsert).not.toHaveBeenCalled();
		expect(mockInvalidate).toHaveBeenCalledWith(ORG_ID);
	});

	it("rejects an organization that is not the active one", async () => {
		await expect(
			call(
				setInsideTrackVideoDuration,
				{ organizationId: "other", circlePostId: "p1", videoDurationSeconds: 60 },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockUpsert).not.toHaveBeenCalled();
	});

	it("rejects non-admins and out-of-range values", async () => {
		mockGetSession.mockResolvedValue({
			user: { ...ADMIN, role: "user" },
			session: { id: "s1", activeOrganizationId: ORG_ID },
		});
		await expect(
			call(
				setInsideTrackVideoDuration,
				{ organizationId: ORG_ID, circlePostId: "p1", videoDurationSeconds: 60 },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		mockGetSession.mockResolvedValue({
			user: ADMIN,
			session: { id: "s1", activeOrganizationId: ORG_ID },
		});
		await expect(
			call(
				setInsideTrackVideoDuration,
				{ organizationId: ORG_ID, circlePostId: "p1", videoDurationSeconds: 0 },
				ctx,
			),
		).rejects.toBeTruthy();
	});
});

describe("listInsideTrackVideoDurations (S13-13)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({
			user: ADMIN,
			session: { id: "s1", activeOrganizationId: ORG_ID },
		});
	});

	it("returns a circlePostId -> seconds map for the org", async () => {
		mockFindMany.mockResolvedValue([
			{ circlePostId: "p1", videoDurationSeconds: 240 },
			{ circlePostId: "p2", videoDurationSeconds: null },
		]);
		const res = await call(listInsideTrackVideoDurations, { organizationId: ORG_ID }, ctx);
		expect(res).toEqual({ p1: 240 });
		expect(mockFindMany).toHaveBeenCalledWith({
			where: { organizationId: ORG_ID },
			select: { circlePostId: true, videoDurationSeconds: true },
		});
	});

	it("rejects a non-active organization", async () => {
		await expect(
			call(listInsideTrackVideoDurations, { organizationId: "other" }, ctx),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
