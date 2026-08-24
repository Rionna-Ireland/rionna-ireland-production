/**
 * provisionCircleMember — horse auto-follow (S6-07 Surface D backend)
 *
 * When a new member is provisioned, if the org's metadata.horseAutoFollow is
 * not explicitly false (default true), auto-follow them to every published
 * horse in the org. Idempotent (createMany + skipDuplicates). Fail-safe: any
 * error in this step is logged and swallowed — it must never block member
 * provisioning, which has already succeeded by this point.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockOrgFindUnique,
	mockUserFindUnique,
	mockMemberUpdate,
	mockHorseFindMany,
	mockHorseFollowCreateMany,
	mockParseOrgMetadata,
	mockCreateMember,
	mockConfirmMemberProfile,
	mockLoggerInfo,
	mockLoggerWarn,
	mockLoggerError,
	mockSyncCircleSpaceMembership,
} = vi.hoisted(() => ({
	mockOrgFindUnique: vi.fn(),
	mockUserFindUnique: vi.fn(),
	mockMemberUpdate: vi.fn(),
	mockHorseFindMany: vi.fn(),
	mockHorseFollowCreateMany: vi.fn(),
	mockParseOrgMetadata: vi.fn(),
	mockCreateMember: vi.fn(),
	mockConfirmMemberProfile: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerError: vi.fn(),
	mockSyncCircleSpaceMembership: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		organization: { findUnique: mockOrgFindUnique },
		user: { findUnique: mockUserFindUnique },
		member: { update: mockMemberUpdate },
		horse: { findMany: mockHorseFindMany },
		horseFollow: { createMany: mockHorseFollowCreateMany },
	},
	parseOrgMetadata: mockParseOrgMetadata,
}));

vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: mockLoggerError, log: vi.fn() },
}));

vi.mock("../circle/index", () => ({
	createCircleService: vi.fn(() => ({
		createMember: mockCreateMember,
		confirmMemberProfile: mockConfirmMemberProfile,
	})),
}));

vi.mock("../circle-space-membership", () => ({
	syncCircleSpaceMembership: mockSyncCircleSpaceMembership,
}));

import { provisionCircleMember } from "../circle-provisioning";

const ORG_ID = "org-rionna";
const ORG = { id: ORG_ID, slug: "rionna", name: "Rionna", metadata: "{}" };
const MEMBER = { id: "m1", userId: "u1", organizationId: ORG_ID };
const USER = { id: "u1", email: "u1@test.com", name: "User One" };
const CIRCLE_MEMBER_ID = "circle-123";
const PUBLISHED_HORSES = [{ id: "h1" }, { id: "h2" }];

describe("provisionCircleMember — horse auto-follow (S6-07 Surface D)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockOrgFindUnique.mockResolvedValue(ORG);
		mockUserFindUnique.mockResolvedValue(USER);
		mockMemberUpdate.mockResolvedValue({});
		mockCreateMember.mockResolvedValue({
			ok: true,
			data: { circleMemberId: CIRCLE_MEMBER_ID },
		});
		mockConfirmMemberProfile.mockResolvedValue({ ok: true, data: undefined });
		mockParseOrgMetadata.mockReturnValue({});
		mockHorseFindMany.mockResolvedValue(PUBLISHED_HORSES);
		mockHorseFollowCreateMany.mockResolvedValue({ count: 2 });
		mockSyncCircleSpaceMembership.mockResolvedValue({ ok: true });
	});

	it("auto-follows every published horse when horseAutoFollow is unset (defaults true)", async () => {
		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockHorseFindMany).toHaveBeenCalledWith({
			where: { organizationId: ORG_ID, publishedAt: { not: null }, inviteOnly: false },
			select: { id: true },
		});
		expect(mockHorseFollowCreateMany).toHaveBeenCalledWith({
			data: [
				{ organizationId: ORG_ID, userId: "u1", horseId: "h1" },
				{ organizationId: ORG_ID, userId: "u1", horseId: "h2" },
			],
			skipDuplicates: true,
		});
	});

	it("auto-follows every published horse when horseAutoFollow is explicitly true", async () => {
		mockParseOrgMetadata.mockReturnValue({ horseAutoFollow: true });

		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockHorseFollowCreateMany).toHaveBeenCalledWith({
			data: [
				{ organizationId: ORG_ID, userId: "u1", horseId: "h1" },
				{ organizationId: ORG_ID, userId: "u1", horseId: "h2" },
			],
			skipDuplicates: true,
		});
	});

	it("does NOT auto-follow when horseAutoFollow is false", async () => {
		mockParseOrgMetadata.mockReturnValue({ horseAutoFollow: false });

		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockHorseFindMany).not.toHaveBeenCalled();
		expect(mockHorseFollowCreateMany).not.toHaveBeenCalled();
	});

	it("is fail-safe: swallows an auto-follow error and still resolves provisioning successfully", async () => {
		mockHorseFollowCreateMany.mockRejectedValue(new Error("db exploded"));

		await expect(provisionCircleMember(MEMBER, "idem-key")).resolves.toBeUndefined();

		expect(mockLoggerWarn).toHaveBeenCalledWith(
			expect.stringContaining("auto-follow"),
			expect.objectContaining({
				surface: "circle.provisioning",
				memberId: "m1",
				organizationId: ORG_ID,
			}),
		);
	});

	it("is fail-safe: swallows an error from the published-horse lookup itself", async () => {
		mockHorseFindMany.mockRejectedValue(new Error("db exploded"));

		await expect(provisionCircleMember(MEMBER, "idem-key")).resolves.toBeUndefined();

		expect(mockHorseFollowCreateMany).not.toHaveBeenCalled();
		expect(mockLoggerWarn).toHaveBeenCalled();
	});

	it("does not auto-follow when there are no published horses (createMany not called with empty data)", async () => {
		mockHorseFindMany.mockResolvedValue([]);

		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockHorseFollowCreateMany).not.toHaveBeenCalled();
	});

	it("excludes invite-only horses from the auto-follow query (S9-05)", async () => {
		await provisionCircleMember(MEMBER, "idem-key");

		expect(mockHorseFindMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: expect.objectContaining({ inviteOnly: false }) }),
		);
	});

	describe("Circle space-membership sync (S8-03 §3)", () => {
		it("joins each published horse's Circle space for the new member", async () => {
			await provisionCircleMember(MEMBER, "idem-key");

			expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				userId: "u1",
				horseId: "h1",
				action: "join",
			});
			expect(mockSyncCircleSpaceMembership).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				userId: "u1",
				horseId: "h2",
				action: "join",
			});
		});

		it("does not attempt joins when there are no published horses", async () => {
			mockHorseFindMany.mockResolvedValue([]);

			await provisionCircleMember(MEMBER, "idem-key");

			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});

		it("does not attempt joins when horseAutoFollow is false", async () => {
			mockParseOrgMetadata.mockReturnValue({ horseAutoFollow: false });

			await provisionCircleMember(MEMBER, "idem-key");

			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});

		it("is fail-safe: a rejected join sync never blocks provisioning", async () => {
			mockSyncCircleSpaceMembership.mockRejectedValue(new Error("circle down"));

			await expect(provisionCircleMember(MEMBER, "idem-key")).resolves.toBeUndefined();
		});

		it("is fail-safe: a failed join outcome never blocks provisioning", async () => {
			mockSyncCircleSpaceMembership.mockResolvedValue({ ok: false });

			await expect(provisionCircleMember(MEMBER, "idem-key")).resolves.toBeUndefined();
		});
	});

	describe("S8-04 §5 kill-switch", () => {
		it("skips auto-follow entirely when features.horseFollows is false, even with horseAutoFollow unset", async () => {
			mockParseOrgMetadata.mockReturnValue({ features: { horseFollows: false } });

			await provisionCircleMember(MEMBER, "idem-key");

			expect(mockHorseFindMany).not.toHaveBeenCalled();
			expect(mockHorseFollowCreateMany).not.toHaveBeenCalled();
			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});

		it("skips auto-follow when features.horseFollows is false even if horseAutoFollow is explicitly true", async () => {
			mockParseOrgMetadata.mockReturnValue({
				features: { horseFollows: false },
				horseAutoFollow: true,
			});

			await provisionCircleMember(MEMBER, "idem-key");

			expect(mockHorseFollowCreateMany).not.toHaveBeenCalled();
			expect(mockSyncCircleSpaceMembership).not.toHaveBeenCalled();
		});

		it("auto-follows normally when features.horseFollows is true (explicit enable)", async () => {
			mockParseOrgMetadata.mockReturnValue({ features: { horseFollows: true } });

			await provisionCircleMember(MEMBER, "idem-key");

			expect(mockHorseFollowCreateMany).toHaveBeenCalledWith({
				data: [
					{ organizationId: ORG_ID, userId: "u1", horseId: "h1" },
					{ organizationId: ORG_ID, userId: "u1", horseId: "h2" },
				],
				skipDuplicates: true,
			});
		});
	});
});
