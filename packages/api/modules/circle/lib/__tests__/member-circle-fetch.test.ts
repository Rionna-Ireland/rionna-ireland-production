import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetMemberToken, mockClearCachedMemberToken, mockCircleFetch } = vi.hoisted(() => ({
	mockGetMemberToken: vi.fn(),
	mockClearCachedMemberToken: vi.fn(),
	mockCircleFetch: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@repo/payments/lib/circle", () => ({
	createCircleService: vi.fn(() => ({ getMemberToken: mockGetMemberToken })),
	getCircleHeadlessApiBaseUrl: () => "https://circle.test/headless",
	circleFetch: mockCircleFetch,
	clearCachedMemberToken: mockClearCachedMemberToken,
}));

import { memberCircleFetch } from "../member-circle-fetch";

const MEMBER = { orgSlug: "club", circleMemberId: "42" };
const LOG = { surface: "test.surface" };

function token(fromCache: boolean) {
	return { ok: true, data: { accessToken: "tok", refreshToken: "", expiresAt: "", fromCache } };
}

describe("memberCircleFetch", () => {
	beforeEach(() => vi.clearAllMocks());

	it("calls the headless API with the member token", async () => {
		mockGetMemberToken.mockResolvedValue(token(false));
		mockCircleFetch.mockResolvedValue(new Response("{}", { status: 200 }));

		const res = await memberCircleFetch(
			MEMBER,
			"/posts/1",
			{ method: "POST", headers: { "Content-Type": "application/json" } },
			LOG,
		);

		expect(res?.status).toBe(200);
		expect(mockCircleFetch).toHaveBeenCalledWith("https://circle.test/headless/posts/1", {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
		});
	});

	it("returns null when the token mint fails", async () => {
		mockGetMemberToken.mockResolvedValue({ ok: false, reason: "server_error" });
		expect(await memberCircleFetch(MEMBER, "/x", {}, LOG)).toBeNull();
		expect(mockCircleFetch).not.toHaveBeenCalled();
	});

	it("returns null when the request throws (timeout, network)", async () => {
		mockGetMemberToken.mockResolvedValue(token(false));
		mockCircleFetch.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
		expect(await memberCircleFetch(MEMBER, "/x", {}, LOG)).toBeNull();
	});

	it("drops a cached token Circle rejects with 401", async () => {
		mockGetMemberToken.mockResolvedValue(token(true));
		mockCircleFetch.mockResolvedValue(new Response("", { status: 401 }));

		const res = await memberCircleFetch(MEMBER, "/x", {}, LOG);

		expect(res?.status).toBe(401);
		expect(mockClearCachedMemberToken).toHaveBeenCalledWith("42");
	});

	it("keeps a freshly minted token on 401", async () => {
		mockGetMemberToken.mockResolvedValue(token(false));
		mockCircleFetch.mockResolvedValue(new Response("", { status: 401 }));
		await memberCircleFetch(MEMBER, "/x", {}, LOG);
		expect(mockClearCachedMemberToken).not.toHaveBeenCalled();
	});
});
