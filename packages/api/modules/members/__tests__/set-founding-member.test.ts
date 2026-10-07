/**
 * setFoundingMember tests (S13-12) — admin toggle
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindUnique, mockMemberUpdate } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindUnique: vi.fn(),
	mockMemberUpdate: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: { member: { findUnique: mockMemberFindUnique, update: mockMemberUpdate } },
}));

import { setFoundingMember } from "../procedures/set-founding-member";

const ctx = { context: { headers: new Headers() } };
const input = { organizationId: "org1", memberId: "m1", foundingMember: false };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({
		user: { id: "a1", role: "admin" },
		session: { id: "s1", activeOrganizationId: "org1" },
	});
	mockMemberFindUnique.mockResolvedValue({ organizationId: "org1" });
});

describe("setFoundingMember", () => {
	it("sets the flag either way", async () => {
		const result = await call(setFoundingMember, input, ctx);
		expect(result).toEqual({ memberId: "m1", foundingMember: false });
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { id: "m1" },
			data: { foundingMember: false },
		});
	});

	it("rejects non-admins", async () => {
		mockGetSession.mockResolvedValue({
			user: { id: "u1", role: null },
			session: { id: "s1", activeOrganizationId: "org1" },
		});
		await expect(call(setFoundingMember, input, ctx)).rejects.toThrow();
		expect(mockMemberUpdate).not.toHaveBeenCalled();
	});

	it("rejects another org's id", async () => {
		await expect(
			call(setFoundingMember, { ...input, organizationId: "org2" }, ctx),
		).rejects.toThrow();
		expect(mockMemberUpdate).not.toHaveBeenCalled();
	});

	it("rejects a member from a different org", async () => {
		mockMemberFindUnique.mockResolvedValue({ organizationId: "org2" });
		await expect(call(setFoundingMember, input, ctx)).rejects.toThrow();
		expect(mockMemberUpdate).not.toHaveBeenCalled();
	});
});
