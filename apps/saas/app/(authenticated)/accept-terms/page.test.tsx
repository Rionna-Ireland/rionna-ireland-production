import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectSpy, mockGetSession, mockGetTermsStatus } = vi.hoisted(() => ({
	redirectSpy: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`);
	}),
	mockGetSession: vi.fn(),
	mockGetTermsStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@auth/lib/server", () => ({ getSession: mockGetSession }));
vi.mock("@repo/api/modules/legal/lib/terms", () => ({ getTermsStatus: mockGetTermsStatus }));
vi.mock("@shared/components/AuthWrapper", () => ({
	AuthWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@auth/components/AcceptTermsForm", () => ({
	AcceptTermsForm: (props: { redirectTo: string }) => ({ form: props }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectSpy }));
vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn(async () => (key: string) => key),
}));

import AcceptTermsPage from "./page";

const SESSION = { user: { id: "u1" }, session: { activeOrganizationId: null } };

function params(redirectTo?: string) {
	return { searchParams: Promise.resolve(redirectTo ? { redirectTo } : {}) };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue(SESSION);
	mockGetTermsStatus.mockResolvedValue({ needsAcceptance: true });
});

describe("AcceptTermsPage (S12-10 A3)", () => {
	it("sends signed-out visitors to login", async () => {
		mockGetSession.mockResolvedValue(null);

		await expect(AcceptTermsPage(params())).rejects.toThrow("REDIRECT:/login");
	});

	it("renders the form with the safe destination when acceptance is needed", async () => {
		const page = await AcceptTermsPage(params("/subscribe"));

		expect(JSON.stringify(page)).toContain('"redirectTo":"/subscribe"');
	});

	it("continues to the destination once accepted", async () => {
		mockGetTermsStatus.mockResolvedValue({ needsAcceptance: false });

		await expect(AcceptTermsPage(params("/choose-plan"))).rejects.toThrow(
			"REDIRECT:/choose-plan",
		);
	});

	it("ignores off-site redirect targets", async () => {
		mockGetTermsStatus.mockResolvedValue({ needsAcceptance: false });

		await expect(AcceptTermsPage(params("//evil.example"))).rejects.toThrow("REDIRECT:/");
	});
});
