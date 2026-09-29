import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectSpy, mockGetSession, mockGetTermsStatus } = vi.hoisted(() => ({
	redirectSpy: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`);
	}),
	mockGetSession: vi.fn(),
	mockGetTermsStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("./server", () => ({ getSession: mockGetSession }));
vi.mock("@repo/api/modules/legal/lib/terms", () => ({ getTermsStatus: mockGetTermsStatus }));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));

import { requireTermsAccepted, safeRedirectPath } from "./terms-gate";

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({
		user: { id: "u1" },
		session: { activeOrganizationId: "org1" },
	});
});

describe("requireTermsAccepted (S12-10 A3)", () => {
	it("redirects to /accept-terms when acceptance is needed", async () => {
		mockGetTermsStatus.mockResolvedValue({ needsAcceptance: true });

		await expect(requireTermsAccepted()).rejects.toThrow("REDIRECT:/accept-terms");
		expect(mockGetTermsStatus).toHaveBeenCalledWith({ userId: "u1" });
	});

	it("carries the return path", async () => {
		mockGetTermsStatus.mockResolvedValue({ needsAcceptance: true });

		await expect(requireTermsAccepted("/subscribe")).rejects.toThrow(
			"REDIRECT:/accept-terms?redirectTo=%2Fsubscribe",
		);
	});

	it("does nothing once the current terms are accepted", async () => {
		mockGetTermsStatus.mockResolvedValue({ needsAcceptance: false });

		await expect(requireTermsAccepted("/subscribe")).resolves.toBeUndefined();
		expect(redirectSpy).not.toHaveBeenCalled();
	});
});

describe("safeRedirectPath", () => {
	it.each([
		[undefined, "/"],
		["", "/"],
		["https://evil.example", "/"],
		["//evil.example", "/"],
		["/\\evil.example", "/"],
		["/choose-plan", "/choose-plan"],
		["/accept-terms", "/"],
		["/accept-terms?redirectTo=%2Fsubscribe", "/"],
		["/accept-terms/", "/"],
		["/accept-terms#top", "/"],
		["/accept-termsx", "/accept-termsx"],
	])("%s → %s", (input, expected) => {
		expect(safeRedirectPath(input)).toBe(expected);
	});
});
