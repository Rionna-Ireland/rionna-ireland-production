import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindUnique, mockItemUpdateMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindUnique: vi.fn(),
	mockItemUpdateMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		member: { findUnique: mockMemberFindUnique },
		inboxItem: { updateMany: mockItemUpdateMany },
	},
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { markAllRead } from "../procedures/mark-all-read";
import { markRead } from "../procedures/mark-read";

const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: { id: "u1", role: "user", name: "Me" } });
	mockMemberFindUnique.mockResolvedValue({ id: "m1" });
	mockItemUpdateMany.mockResolvedValue({ count: 1 });
});

describe("inbox.markRead", () => {
	it("marks a single item read", async () => {
		const result = await call(markRead, { organizationId: "org1", id: "i1" }, ctx);
		expect(mockItemUpdateMany).toHaveBeenCalledWith({
			where: { id: "i1", userId: "u1", organizationId: "org1", readAt: null },
			data: { readAt: expect.any(Date) },
		});
		expect(result).toEqual({ ok: true });
	});

	it("returns ok:false and skips the update for non-members", async () => {
		mockMemberFindUnique.mockResolvedValue(null);
		const result = await call(markRead, { organizationId: "org1", id: "i1" }, ctx);
		expect(result).toEqual({ ok: false });
		expect(mockItemUpdateMany).not.toHaveBeenCalled();
	});
});

describe("inbox.markAllRead", () => {
	it("marks every unread item read", async () => {
		const result = await call(markAllRead, { organizationId: "org1" }, ctx);
		expect(mockItemUpdateMany).toHaveBeenCalledWith({
			where: { userId: "u1", organizationId: "org1", readAt: null },
			data: { readAt: expect.any(Date) },
		});
		expect(result).toEqual({ ok: true });
	});

	it("returns ok:false and skips the update for non-members", async () => {
		mockMemberFindUnique.mockResolvedValue(null);
		const result = await call(markAllRead, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ ok: false });
		expect(mockItemUpdateMany).not.toHaveBeenCalled();
	});
});
