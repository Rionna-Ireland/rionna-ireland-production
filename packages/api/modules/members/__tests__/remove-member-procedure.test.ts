/**
 * removeClubMember procedure (S2-10) — the adminProcedure wrapper around the
 * removeMember orchestration. Covers the two API-boundary safety gates
 * (org-scope + confirm-name), delegation, and guard→ORPCError mapping.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindUnique, mockRemoveMember } = vi.hoisted(
	() => ({
		mockGetSession: vi.fn(),
		mockMemberFindUnique: vi.fn(),
		mockRemoveMember: vi.fn(),
	}),
);

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { member: { findUnique: mockMemberFindUnique } },
}));

// Fully mock the orchestration (importing the real module pulls in the
// Stripe→mail chain). Provide a stand-in RemoveMemberError so the procedure's
// instanceof check resolves to the same class the test throws.
vi.mock("../lib/remove-member", () => {
	class RemoveMemberError extends Error {
		code: string;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
			this.name = "RemoveMemberError";
		}
	}
	return { removeMember: mockRemoveMember, RemoveMemberError };
});

import { RemoveMemberError } from "../lib/remove-member";
import { removeClubMember } from "../procedures/remove-member";

const ADMIN = { id: "admin", role: "admin", name: "Emma" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

const okInput = { organizationId: "org1", memberId: "m1", confirmName: "Alice" };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: ADMIN, session: SESSION });
	mockMemberFindUnique.mockResolvedValue({
		id: "m1",
		organizationId: "org1",
		user: { name: "Alice", email: "alice@test.com" },
	});
	mockRemoveMember.mockResolvedValue({
		stripe: "ok",
		circle: "ok",
		app: "ok",
	});
});

describe("removeClubMember procedure (S2-10)", () => {
	it("removes the member and returns the per-system summary on the happy path", async () => {
		const result = await call(removeClubMember, okInput, ctx);

		expect(mockRemoveMember).toHaveBeenCalledWith({
			memberId: "m1",
			organizationId: "org1",
			actorUserId: "admin",
		});
		expect(result).toEqual({ stripe: "ok", circle: "ok", app: "ok" });
	});

	it("forbids acting on an organization that isn't the admin's active org", async () => {
		await expect(
			call(removeClubMember, { ...okInput, organizationId: "org2" }, ctx),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockRemoveMember).not.toHaveBeenCalled();
	});

	it("rejects when the typed confirmation name doesn't match the member", async () => {
		await expect(
			call(removeClubMember, { ...okInput, confirmName: "Wrong Name" }, ctx),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mockRemoveMember).not.toHaveBeenCalled();
	});

	it("maps a last_admin guard error to BAD_REQUEST", async () => {
		mockRemoveMember.mockRejectedValue(
			new RemoveMemberError("last_admin", "Cannot remove the last owner/admin"),
		);

		await expect(call(removeClubMember, okInput, ctx)).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
	});

	it("maps a member_not_found guard error to NOT_FOUND", async () => {
		mockRemoveMember.mockRejectedValue(
			new RemoveMemberError("member_not_found", "Member not found"),
		);

		await expect(call(removeClubMember, okInput, ctx)).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});
});
