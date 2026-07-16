/**
 * Member token cache tests (FABLE_AUDIT P3)
 *
 * RealCircleService.getMemberToken persists minted member JWTs on the Member
 * row (circleAccessToken / circleAccessTokenExpiresAt) and reuses them until
 * shortly before expiry, instead of minting a fresh Circle token per request.
 * The cache fails open: any DB error falls back to a fresh mint.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockMint, mockMemberFindFirst, mockMemberUpdateMany, mockLogger } = vi.hoisted(() => ({
	mockMint: vi.fn(),
	mockMemberFindFirst: vi.fn(),
	mockMemberUpdateMany: vi.fn(),
	mockLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
}));

vi.mock("@circleco/headless-server-sdk", () => ({
	createClient: vi.fn(() => ({
		getMemberAPITokenFromCommunityMemberId: mockMint,
	})),
}));

vi.mock("@repo/database", () => ({
	db: {
		member: {
			findFirst: mockMemberFindFirst,
			updateMany: mockMemberUpdateMany,
		},
	},
}));

vi.mock("@repo/logs", () => ({ logger: mockLogger }));

import { clearCachedMemberToken } from "../member-token-cache";
import { RealCircleService } from "../real";

const CIRCLE_MEMBER_ID = "12345";

function makeService() {
	return new RealCircleService("admin-token", "headless-app-token");
}

function mintedWire() {
	return {
		access_token: "fresh-jwt",
		refresh_token: "fresh-refresh",
		access_token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
	};
}

function cachedRow(expiresInMs: number) {
	return {
		circleAccessToken: "cached-jwt",
		circleAccessTokenExpiresAt: new Date(Date.now() + expiresInMs),
		circleRefreshToken: "cached-refresh",
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockMemberUpdateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("RealCircleService.getMemberToken caching", () => {
	it("returns the cached token without minting when it is fresh", async () => {
		mockMemberFindFirst.mockResolvedValue(cachedRow(30 * 60_000));

		const outcome = await makeService().getMemberToken(CIRCLE_MEMBER_ID);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) {
			return;
		}
		expect(outcome.data.accessToken).toBe("cached-jwt");
		expect(outcome.data.fromCache).toBe(true);
		expect(mockMint).not.toHaveBeenCalled();
	});

	it("mints and persists when no token is cached", async () => {
		mockMemberFindFirst.mockResolvedValue({
			circleAccessToken: null,
			circleAccessTokenExpiresAt: null,
			circleRefreshToken: null,
		});
		mockMint.mockResolvedValue(mintedWire());

		const outcome = await makeService().getMemberToken(CIRCLE_MEMBER_ID);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) {
			return;
		}
		expect(outcome.data.accessToken).toBe("fresh-jwt");
		expect(outcome.data.fromCache).toBeFalsy();
		expect(mockMint).toHaveBeenCalledOnce();
		expect(mockMemberUpdateMany).toHaveBeenCalledWith({
			where: { circleMemberId: CIRCLE_MEMBER_ID },
			data: expect.objectContaining({
				circleAccessToken: "fresh-jwt",
				circleRefreshToken: "fresh-refresh",
				circleAccessTokenExpiresAt: expect.any(Date),
			}),
		});
	});

	it("re-mints when the cached token expires within the safety margin", async () => {
		mockMemberFindFirst.mockResolvedValue(cachedRow(2 * 60_000));
		mockMint.mockResolvedValue(mintedWire());

		const outcome = await makeService().getMemberToken(CIRCLE_MEMBER_ID);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) {
			return;
		}
		expect(outcome.data.accessToken).toBe("fresh-jwt");
		expect(mockMint).toHaveBeenCalledOnce();
	});

	it("does not persist anything when the mint fails", async () => {
		mockMemberFindFirst.mockResolvedValue({
			circleAccessToken: null,
			circleAccessTokenExpiresAt: null,
			circleRefreshToken: null,
		});
		mockMint.mockRejectedValue(new Error("401 unauthorized"));

		const outcome = await makeService().getMemberToken(CIRCLE_MEMBER_ID);

		expect(outcome.ok).toBe(false);
		expect(mockMemberUpdateMany).not.toHaveBeenCalled();
	});

	it("still mints when the cache read fails (fail-open)", async () => {
		mockMemberFindFirst.mockRejectedValue(new Error("db down"));
		mockMint.mockResolvedValue(mintedWire());

		const outcome = await makeService().getMemberToken(CIRCLE_MEMBER_ID);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) {
			return;
		}
		expect(outcome.data.accessToken).toBe("fresh-jwt");
	});

	it("still returns the minted token when persisting the cache fails (fail-open)", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		mockMemberUpdateMany.mockRejectedValue(new Error("db down"));
		mockMint.mockResolvedValue(mintedWire());

		const outcome = await makeService().getMemberToken(CIRCLE_MEMBER_ID);

		expect(outcome.ok).toBe(true);
		if (!outcome.ok) {
			return;
		}
		expect(outcome.data.accessToken).toBe("fresh-jwt");
	});
});

describe("clearCachedMemberToken", () => {
	it("clears the cached access token columns", async () => {
		await clearCachedMemberToken(CIRCLE_MEMBER_ID);

		expect(mockMemberUpdateMany).toHaveBeenCalledWith({
			where: { circleMemberId: CIRCLE_MEMBER_ID },
			data: { circleAccessToken: null, circleAccessTokenExpiresAt: null },
		});
	});

	it("swallows db errors (cache clearing is best-effort)", async () => {
		mockMemberUpdateMany.mockRejectedValue(new Error("db down"));

		await expect(clearCachedMemberToken(CIRCLE_MEMBER_ID)).resolves.toBeUndefined();
	});
});

describe("RealCircleService.getMemberNotifications cache invalidation", () => {
	it("clears the cached token when Circle rejects it with a 401", async () => {
		mockMemberFindFirst.mockResolvedValue(cachedRow(30 * 60_000));
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => "unauthorized",
			}),
		);

		const outcome = await makeService().getMemberNotifications(CIRCLE_MEMBER_ID, {
			sinceNotificationId: null,
		});

		expect(outcome.ok).toBe(false);
		expect(mockMemberUpdateMany).toHaveBeenCalledWith({
			where: { circleMemberId: CIRCLE_MEMBER_ID },
			data: { circleAccessToken: null, circleAccessTokenExpiresAt: null },
		});
	});

	it("does not clear the cache when the failing token was freshly minted", async () => {
		mockMemberFindFirst.mockResolvedValue(null);
		mockMint.mockResolvedValue(mintedWire());
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => "unauthorized",
			}),
		);

		const outcome = await makeService().getMemberNotifications(CIRCLE_MEMBER_ID, {
			sinceNotificationId: null,
		});

		expect(outcome.ok).toBe(false);
		// The only updateMany call should be the cache *write* from the mint —
		// never a clearing write (circleAccessToken: null).
		const clearingCalls = mockMemberUpdateMany.mock.calls.filter(
			([args]) => args?.data?.circleAccessToken === null,
		);
		expect(clearingCalls).toHaveLength(0);
	});
});
