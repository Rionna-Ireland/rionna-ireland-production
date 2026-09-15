import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockMemberFindUnique } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockMemberFindUnique: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock("@repo/database", () => ({
	db: {
		member: { findUnique: mockMemberFindUnique },
	},
}));
vi.mock("@repo/logs", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { getBadgeCount, readUnseenCount } from "../procedures/get-badge-count";

const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: { id: "u1", role: "user", name: "Me" } });
});

describe("inbox.badgeCount", () => {
	it("returns the member's unseen count", async () => {
		mockMemberFindUnique.mockResolvedValue({ inboxUnseenCount: 7 });
		const result = await call(getBadgeCount, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ count: 7 });
	});

	it("clamps to 99", async () => {
		mockMemberFindUnique.mockResolvedValue({ inboxUnseenCount: 250 });
		const result = await call(getBadgeCount, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ count: 99 });
	});

	it("returns 0 for non-members", async () => {
		mockMemberFindUnique.mockResolvedValue(null);
		const result = await call(getBadgeCount, { organizationId: "org1" }, ctx);
		expect(result).toEqual({ count: 0 });
	});
});

describe("readUnseenCount", () => {
	it("reads the counter directly", async () => {
		mockMemberFindUnique.mockResolvedValue({ inboxUnseenCount: 3 });
		expect(await readUnseenCount("u1", "org1")).toBe(3);
	});
});
