import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockUpsert, mockDeleteMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockUpsert: vi.fn(),
	mockDeleteMany: vi.fn(),
}));
vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: { horseFollow: { upsert: mockUpsert, deleteMany: mockDeleteMany } },
}));

import { followHorseProcedure, unfollowHorseProcedure } from "../follow-horse";

const USER = { id: "u-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org-1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockUpsert.mockResolvedValue({ id: "hf-1" });
	mockDeleteMany.mockResolvedValue({ count: 1 });
});

describe("followHorseProcedure", () => {
	it("follows the horse for the current user + active org", async () => {
		const res = await call(followHorseProcedure, { horseId: "h-1" }, ctx);
		expect(mockUpsert).toHaveBeenCalledWith({
			where: { userId_horseId: { userId: "u-1", horseId: "h-1" } },
			create: { organizationId: "org-1", userId: "u-1", horseId: "h-1" },
			update: {},
		});
		expect(res).toEqual({ ok: true, isFollowing: true });
	});
});

describe("unfollowHorseProcedure", () => {
	it("unfollows for the current user", async () => {
		const res = await call(unfollowHorseProcedure, { horseId: "h-1" }, ctx);
		expect(mockDeleteMany).toHaveBeenCalled();
		expect(res).toEqual({ ok: true, isFollowing: false });
	});
});
