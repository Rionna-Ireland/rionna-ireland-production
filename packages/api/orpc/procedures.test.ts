import { call, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockMemberFindFirst } = vi.hoisted(() => ({ mockMemberFindFirst: vi.fn() }));

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

vi.mock("@repo/database", () => ({ db: { member: { findFirst: mockMemberFindFirst } } }));

import { auth } from "@repo/auth";

import { deriveMembershipStatus } from "../modules/members/lib/membership-status";
import { adminProcedure, memberProcedure, protectedProcedure, publicProcedure } from "./procedures";

describe("publicProcedure", () => {
	it("is defined", () => {
		expect(publicProcedure).toBeDefined();
	});
});

describe("protectedProcedure", () => {
	it("is defined", () => {
		expect(protectedProcedure).toBeDefined();
	});

	it("throws UNAUTHORIZED when session is null", async () => {
		vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

		const testProcedure = protectedProcedure.handler(async () => ({
			success: true,
		}));

		await expect(
			call(testProcedure, undefined, {
				context: { headers: new Headers() },
			}),
		).rejects.toThrow(ORPCError);
		await expect(
			call(testProcedure, undefined, {
				context: { headers: new Headers() },
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("passes user and session to context when authenticated", async () => {
		const mockUser = { id: "user-1", role: "user", name: "Test User" };
		const mockSession = { id: "session-1", userId: "user-1" };
		vi.mocked(auth.api.getSession).mockResolvedValue({
			user: mockUser,
			session: mockSession,
		} as never);

		let capturedContext: unknown;
		const testProcedure = protectedProcedure.handler(
			async ({ context }: { context: unknown }) => {
				capturedContext = context;
				return { success: true };
			},
		);

		await call(testProcedure, undefined, {
			context: { headers: new Headers() },
		});

		expect(capturedContext).toMatchObject({
			user: mockUser,
			session: mockSession,
		});
	});
});

describe("adminProcedure", () => {
	it("is defined", () => {
		expect(adminProcedure).toBeDefined();
	});

	it("throws FORBIDDEN when user role is not admin", async () => {
		vi.mocked(auth.api.getSession).mockResolvedValue({
			user: { id: "user-1", role: "user" },
			session: { id: "session-1" },
		} as never);

		const testProcedure = adminProcedure.handler(async () => ({
			success: true,
		}));

		await expect(
			call(testProcedure, undefined, {
				context: { headers: new Headers() },
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows admin users through", async () => {
		vi.mocked(auth.api.getSession).mockResolvedValue({
			user: { id: "admin-1", role: "admin" },
			session: { id: "session-1" },
		} as never);

		const testProcedure = adminProcedure.handler(async () => ({
			success: true,
		}));

		const result = await call(testProcedure, undefined, {
			context: { headers: new Headers() },
		});

		expect(result).toEqual({ success: true });
	});
});

describe("memberProcedure (W-04)", () => {
	const ctx = { context: { headers: new Headers() } };
	const testProcedure = memberProcedure
		.input(z.object({ organizationId: z.string() }).optional())
		.handler(async () => ({ success: true }));

	function asUser(role: string | null, activeOrganizationId: string | null = "org-1") {
		vi.mocked(auth.api.getSession).mockResolvedValue({
			user: { id: "user-1", role },
			session: { id: "session-1", activeOrganizationId },
		} as never);
	}

	function paidWhere(organizationId: string | undefined) {
		return {
			userId: "user-1",
			organizationId,
			user: {
				purchases: {
					some: { organizationId, status: { in: ["active", "trialing", "past_due"] } },
				},
			},
		};
	}

	beforeEach(() => {
		mockMemberFindFirst.mockReset();
	});

	it("lets active and past_due members through (one paying-member query)", async () => {
		asUser(null);
		mockMemberFindFirst.mockResolvedValue({ id: "m1" });

		await expect(call(testProcedure, { organizationId: "org-1" }, ctx)).resolves.toEqual({
			success: true,
		});
		expect(mockMemberFindFirst).toHaveBeenCalledTimes(1);
		expect(mockMemberFindFirst.mock.calls[0][0].where).toEqual(paidWhere("org-1"));
	});

	it("uses the same statuses deriveMembershipStatus treats as active or past_due", () => {
		for (const status of ["active", "trialing", "past_due"]) {
			expect(["active", "past_due"]).toContain(deriveMembershipStatus([status]));
		}
		for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired"]) {
			expect(["cancelled", "none"]).toContain(deriveMembershipStatus([status]));
		}
	});

	it("refuses cancelled or never-paid users with membership_inactive", async () => {
		asUser(null);
		mockMemberFindFirst.mockResolvedValue(null);

		await expect(call(testProcedure, { organizationId: "org-1" }, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
			data: { reason: "membership_inactive" },
		});
	});

	it("checks the org named in the input, not only the session's active org", async () => {
		asUser(null, "org-1");
		mockMemberFindFirst.mockResolvedValue(null);

		await expect(call(testProcedure, { organizationId: "org-2" }, ctx)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(mockMemberFindFirst.mock.calls[0][0].where).toEqual(paidWhere("org-2"));
	});

	it("falls back to the session's active org when the input has none", async () => {
		asUser(null, "org-1");
		mockMemberFindFirst.mockResolvedValue({ id: "m1" });

		await call(testProcedure, undefined, ctx);
		expect(mockMemberFindFirst.mock.calls[0][0].where).toEqual(paidWhere("org-1"));
	});

	it.each(["admin", "platformAdmin"])("lets %s through with no Purchase", async (role) => {
		asUser(role);

		await expect(call(testProcedure, { organizationId: "org-1" }, ctx)).resolves.toEqual({
			success: true,
		});
		expect(mockMemberFindFirst).not.toHaveBeenCalled();
	});
});
