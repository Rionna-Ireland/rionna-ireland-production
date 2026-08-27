/**
 * setInsideTrackPins tests (S11-01 task 5)
 *
 * Overwrites metadata.circle.insideTrack.pinnedPostIds with the ordered list
 * the admin sends, preserving spaceId and every other org metadata key.
 * Validates the input (max 20, distinct) and emits a structured audit log.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockOrgFindUnique, mockOrgUpdate, mockParseOrgMetadata, mockLoggerInfo } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockOrgFindUnique: vi.fn(),
		mockOrgUpdate: vi.fn(),
		mockParseOrgMetadata: vi.fn(),
		mockLoggerInfo: vi.fn(),
	}));

vi.mock("@repo/auth", () => ({
	auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@repo/database", () => ({
	db: { organization: { findUnique: mockOrgFindUnique, update: mockOrgUpdate } },
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: vi.fn(), error: vi.fn(), log: vi.fn() },
}));

import { setInsideTrackPins } from "../procedures/set-inside-track-pins";

const ORG_ID = "org1";
const ADMIN = { id: "u1", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: ORG_ID };
const ctx = { context: { headers: new Headers() } };

const EXISTING_METADATA_RAW = JSON.stringify({
	circle: { insideTrack: { spaceId: "s" }, communitySpaceId: "c" },
	features: { x: true },
});

const EXISTING_METADATA_PARSED = {
	circle: { insideTrack: { spaceId: "s" }, communitySpaceId: "c" },
	features: { x: true },
};

describe("setInsideTrackPins (S11-01 task 5)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
		mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, metadata: EXISTING_METADATA_RAW });
		mockParseOrgMetadata.mockReturnValue(EXISTING_METADATA_PARSED);
		mockOrgUpdate.mockResolvedValue({ id: ORG_ID });
	});

	it("overwrites pinnedPostIds preserving the rest of the metadata", async () => {
		const result = await call(
			setInsideTrackPins,
			{ organizationId: ORG_ID, pinnedPostIds: ["p1", "p2"] },
			ctx,
		);

		expect(result).toEqual({ pinnedPostIds: ["p1", "p2"] });
		expect(mockOrgUpdate).toHaveBeenCalledTimes(1);
		const call0 = mockOrgUpdate.mock.calls[0][0];
		expect(call0.where).toEqual({ id: ORG_ID });
		const savedMetadata = JSON.parse(call0.data.metadata);
		expect(savedMetadata).toEqual({
			circle: {
				insideTrack: { spaceId: "s", pinnedPostIds: ["p1", "p2"] },
				communitySpaceId: "c",
			},
			features: { x: true },
		});
	});

	it("rejects duplicate pinned post ids", async () => {
		await expect(
			call(setInsideTrackPins, { organizationId: ORG_ID, pinnedPostIds: ["p1", "p1"] }, ctx),
		).rejects.toThrow();
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("rejects more than 20 pinned post ids", async () => {
		const tooMany = Array.from({ length: 21 }, (_, i) => `p${i}`);

		await expect(
			call(setInsideTrackPins, { organizationId: ORG_ID, pinnedPostIds: tooMany }, ctx),
		).rejects.toThrow();
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND when the organization does not exist", async () => {
		mockOrgFindUnique.mockResolvedValue(null);

		await expect(
			call(setInsideTrackPins, { organizationId: ORG_ID, pinnedPostIds: ["p1"] }, ctx),
		).rejects.toThrow();
		expect(mockOrgUpdate).not.toHaveBeenCalled();
	});

	it("emits a structured audit log", async () => {
		await call(
			setInsideTrackPins,
			{ organizationId: ORG_ID, pinnedPostIds: ["p1", "p2"] },
			ctx,
		);

		expect(mockLoggerInfo).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				event: expect.any(String),
				organizationId: ORG_ID,
				userId: ADMIN.id,
			}),
		);
	});
});
