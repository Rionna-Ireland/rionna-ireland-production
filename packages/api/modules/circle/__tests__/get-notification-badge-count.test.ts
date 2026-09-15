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

import { getNotificationBadgeCount } from "../procedures/get-notification-badge-count";

const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ session: { id: "s1" }, user: { id: "u1", role: "user", name: "Me" } });
});

describe("legacy circle.notificationBadgeCount", () => {
	it("returns { count } from Member.inboxUnseenCount, without calling fetch", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		mockMemberFindUnique.mockResolvedValue({ inboxUnseenCount: 7 });

		const result = await call(getNotificationBadgeCount, { organizationId: "org1" }, ctx);

		expect(result).toEqual({ count: 7 });
		expect(mockMemberFindUnique).toHaveBeenCalledWith({
			where: { organizationId_userId: { organizationId: "org1", userId: "u1" } },
			select: { inboxUnseenCount: true },
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it("clamps the count to 99, without calling fetch", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		mockMemberFindUnique.mockResolvedValue({ inboxUnseenCount: 250 });

		const result = await call(getNotificationBadgeCount, { organizationId: "org1" }, ctx);

		expect(result).toEqual({ count: 99 });
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it("returns 0 for non-members, without calling fetch", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		mockMemberFindUnique.mockResolvedValue(null);

		const result = await call(getNotificationBadgeCount, { organizationId: "org1" }, ctx);

		expect(result).toEqual({ count: 0 });
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
