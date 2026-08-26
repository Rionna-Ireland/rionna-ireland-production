/**
 * syncCircleSpaceMembership (S8-03 §3)
 *
 * follow = join the horse's Circle space, unfollow = leave it. Never throws:
 * any failure (no circleMemberId, no active space, token mint failure,
 * network error, non-2xx response) is logged and swallowed — the caller's DB
 * write must never be blocked by Circle availability.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockMemberFindFirst,
	mockHorseFindFirst,
	mockOrgFindUnique,
	mockGetMemberToken,
	mockAddSpaceMember,
	mockRemoveSpaceMember,
	mockCreateCircleService,
	mockGetCircleHeadlessApiBaseUrl,
	mockLoggerWarn,
	mockLoggerDebug,
	mockFetch,
} = vi.hoisted(() => ({
	mockMemberFindFirst: vi.fn(),
	mockHorseFindFirst: vi.fn(),
	mockOrgFindUnique: vi.fn(),
	mockGetMemberToken: vi.fn(),
	mockAddSpaceMember: vi.fn(),
	mockRemoveSpaceMember: vi.fn(),
	mockCreateCircleService: vi.fn(),
	mockGetCircleHeadlessApiBaseUrl: vi.fn(),
	mockLoggerWarn: vi.fn(),
	mockLoggerDebug: vi.fn(),
	mockFetch: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		member: { findFirst: mockMemberFindFirst },
		horse: { findFirst: mockHorseFindFirst },
		organization: { findUnique: mockOrgFindUnique },
	},
}));

vi.mock("@repo/logs", () => ({
	logger: { warn: mockLoggerWarn, debug: mockLoggerDebug, info: vi.fn(), error: vi.fn() },
}));

vi.mock("../circle", () => ({
	createCircleService: mockCreateCircleService,
	getCircleHeadlessApiBaseUrl: mockGetCircleHeadlessApiBaseUrl,
}));

import { syncCircleSpaceMembership } from "../circle-space-membership";

const ORG_ID = "org-1";
const USER_ID = "user-1";
const HORSE_ID = "horse-1";
const CIRCLE_MEMBER_ID = "circle-member-1";
const CIRCLE_SPACE_ID = "space-1";

const MEMBER_EMAIL = "member@example.com";

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", mockFetch);
	mockMemberFindFirst.mockResolvedValue({
		circleMemberId: CIRCLE_MEMBER_ID,
		user: { email: MEMBER_EMAIL },
	});
	mockHorseFindFirst.mockResolvedValue({
		circleSpaceId: CIRCLE_SPACE_ID,
		circleSpaceStatus: "active",
		inviteOnly: false,
	});
	mockOrgFindUnique.mockResolvedValue({ slug: "rionna" });
	mockGetMemberToken.mockResolvedValue({ ok: true, data: { accessToken: "token-abc" } });
	mockAddSpaceMember.mockResolvedValue({ ok: true, data: { spaceId: CIRCLE_SPACE_ID, email: MEMBER_EMAIL } });
	mockRemoveSpaceMember.mockResolvedValue({ ok: true, data: { spaceId: CIRCLE_SPACE_ID, email: MEMBER_EMAIL } });
	mockCreateCircleService.mockReturnValue({
		getMemberToken: mockGetMemberToken,
		addSpaceMember: mockAddSpaceMember,
		removeSpaceMember: mockRemoveSpaceMember,
	});
	mockGetCircleHeadlessApiBaseUrl.mockReturnValue("https://app.circle.so/api/headless/v1");
	mockFetch.mockResolvedValue({ ok: true, status: 200 });
});

describe("syncCircleSpaceMembership", () => {
	it("join: POSTs to /spaces/{id}/join with the member's bearer token", async () => {
		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
		expect(mockGetMemberToken).toHaveBeenCalledWith(CIRCLE_MEMBER_ID);
		expect(mockFetch).toHaveBeenCalledWith(
			"https://app.circle.so/api/headless/v1/spaces/space-1/join",
			{ method: "POST", headers: { Authorization: "Bearer token-abc" } },
		);
		expect(result).toEqual({ ok: true });
	});

	it("leave: POSTs to /spaces/{id}/leave with the member's bearer token", async () => {
		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "leave",
		});

		expect(mockFetch).toHaveBeenCalledWith(
			"https://app.circle.so/api/headless/v1/spaces/space-1/leave",
			{ method: "POST", headers: { Authorization: "Bearer token-abc" } },
		);
		expect(result).toEqual({ ok: true });
	});

	it("skips silently when the member has no circleMemberId", async () => {
		mockMemberFindFirst.mockResolvedValue({ circleMemberId: null, user: { email: MEMBER_EMAIL } });

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(result).toEqual({ ok: false });
		expect(mockFetch).not.toHaveBeenCalled();
		expect(mockLoggerWarn).not.toHaveBeenCalled();
	});

	it("skips silently when the horse has no circleSpaceId", async () => {
		mockHorseFindFirst.mockResolvedValue({ circleSpaceId: null, circleSpaceStatus: "active" });

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(result).toEqual({ ok: false });
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("skips silently when the horse's space is not active", async () => {
		mockHorseFindFirst.mockResolvedValue({ circleSpaceId: CIRCLE_SPACE_ID, circleSpaceStatus: "provisioning_failed" });

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(result).toEqual({ ok: false });
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("never throws and warns when token mint fails", async () => {
		mockGetMemberToken.mockResolvedValue({ ok: false, reason: "network" });

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(result).toEqual({ ok: false });
		expect(mockLoggerWarn).toHaveBeenCalled();
	});

	it("never throws and warns when fetch throws (network failure)", async () => {
		mockFetch.mockRejectedValue(new Error("network down"));

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(result).toEqual({ ok: false });
		expect(mockLoggerWarn).toHaveBeenCalled();
	});

	it("never throws and warns on a non-2xx response (idempotent from caller's view)", async () => {
		mockFetch.mockResolvedValue({ ok: false, status: 422 });

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "leave",
		});

		expect(result).toEqual({ ok: false });
		expect(mockLoggerWarn).toHaveBeenCalled();
	});

	it("never throws and warns when the org has no slug", async () => {
		mockOrgFindUnique.mockResolvedValue({ slug: null });

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(result).toEqual({ ok: false });
		expect(mockLoggerWarn).toHaveBeenCalled();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	describe("invite-only horses (admin API branch)", () => {
		beforeEach(() => {
			mockHorseFindFirst.mockResolvedValue({
				circleSpaceId: CIRCLE_SPACE_ID,
				circleSpaceStatus: "active",
				inviteOnly: true,
			});
		});

		it("join: calls service.addSpaceMember with the member's email, not the member-token fetch", async () => {
			const result = await syncCircleSpaceMembership({
				organizationId: ORG_ID,
				userId: USER_ID,
				horseId: HORSE_ID,
				action: "join",
			});

			expect(mockCreateCircleService).toHaveBeenCalledWith("rionna");
			expect(mockAddSpaceMember).toHaveBeenCalledWith({ spaceId: CIRCLE_SPACE_ID, email: MEMBER_EMAIL });
			expect(mockRemoveSpaceMember).not.toHaveBeenCalled();
			expect(mockGetMemberToken).not.toHaveBeenCalled();
			expect(mockFetch).not.toHaveBeenCalled();
			expect(result).toEqual({ ok: true });
		});

		it("leave: calls service.removeSpaceMember with the member's email, not the member-token fetch", async () => {
			const result = await syncCircleSpaceMembership({
				organizationId: ORG_ID,
				userId: USER_ID,
				horseId: HORSE_ID,
				action: "leave",
			});

			expect(mockRemoveSpaceMember).toHaveBeenCalledWith({ spaceId: CIRCLE_SPACE_ID, email: MEMBER_EMAIL });
			expect(mockAddSpaceMember).not.toHaveBeenCalled();
			expect(mockGetMemberToken).not.toHaveBeenCalled();
			expect(mockFetch).not.toHaveBeenCalled();
			expect(result).toEqual({ ok: true });
		});

		it("never throws and warns when the member has no user email", async () => {
			mockMemberFindFirst.mockResolvedValue({ circleMemberId: CIRCLE_MEMBER_ID, user: { email: null } });

			const result = await syncCircleSpaceMembership({
				organizationId: ORG_ID,
				userId: USER_ID,
				horseId: HORSE_ID,
				action: "join",
			});

			expect(result).toEqual({ ok: false });
			expect(mockLoggerWarn).toHaveBeenCalled();
			expect(mockAddSpaceMember).not.toHaveBeenCalled();
			expect(mockRemoveSpaceMember).not.toHaveBeenCalled();
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("never throws and warns when the admin API call fails", async () => {
			mockAddSpaceMember.mockResolvedValue({ ok: false, reason: "forbidden", retriable: false });

			const result = await syncCircleSpaceMembership({
				organizationId: ORG_ID,
				userId: USER_ID,
				horseId: HORSE_ID,
				action: "join",
			});

			expect(result).toEqual({ ok: false });
			expect(mockLoggerWarn).toHaveBeenCalled();
		});
	});

	it("regression: inviteOnly false still uses the member-token join path", async () => {
		mockHorseFindFirst.mockResolvedValue({
			circleSpaceId: CIRCLE_SPACE_ID,
			circleSpaceStatus: "active",
			inviteOnly: false,
		});

		const result = await syncCircleSpaceMembership({
			organizationId: ORG_ID,
			userId: USER_ID,
			horseId: HORSE_ID,
			action: "join",
		});

		expect(mockGetMemberToken).toHaveBeenCalledWith(CIRCLE_MEMBER_ID);
		expect(mockFetch).toHaveBeenCalledWith(
			"https://app.circle.so/api/headless/v1/spaces/space-1/join",
			{ method: "POST", headers: { Authorization: "Bearer token-abc" } },
		);
		expect(mockAddSpaceMember).not.toHaveBeenCalled();
		expect(result).toEqual({ ok: true });
	});
});
