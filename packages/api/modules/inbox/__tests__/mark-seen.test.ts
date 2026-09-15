import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindUnique, mockMemberUpdate } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindUnique: vi.fn(),
	mockMemberUpdate: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		member: { findUnique: mockMemberFindUnique, update: mockMemberUpdate },
	},
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { markSeen } from "../procedures/mark-seen";

const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: { id: "u1", role: "user", name: "Me" } });
	mockMemberFindUnique.mockResolvedValue({ id: "m1" });
	mockMemberUpdate.mockResolvedValue({ id: "m1" });
});

describe("inbox.markSeen", () => {
	it("resets the unseen badge count", async () => {
		const result = await call(markSeen, { organizationId: "org1" }, ctx);
		expect(mockMemberUpdate).toHaveBeenCalledWith({
			where: { organizationId_userId: { organizationId: "org1", userId: "u1" } },
			data: { inboxUnseenCount: 0 },
		});
		expect(result).toEqual({ ok: true });
	});

	it("returns ok:false and skips the update for non-members", async () => {
		mockMemberFindUnique.mockResolvedValue(null);
		const result = await call(markSeen, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ ok: false });
		expect(mockMemberUpdate).not.toHaveBeenCalled();
	});
});
