/**
 * unregisterPushToken ownership scoping (S5-07 item 5).
 *
 * A caller may only unregister their OWN push token — the delete must be scoped
 * to the session user, not just the token value.
 */

import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockPushTokenDeleteMany } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockPushTokenDeleteMany: vi.fn(),
}));

vi.mock("@repo/auth", () => ({ auth: { api: { getSession: mockGetSession } } }));

vi.mock("@repo/database", () => ({
	db: { pushToken: { deleteMany: mockPushTokenDeleteMany } },
}));

import { unregisterPushToken } from "./unregister-token";

const USER = { id: "user-1", role: "member" };
const SESSION = { id: "s1", activeOrganizationId: "org1" };
const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue({ user: USER, session: SESSION });
	mockPushTokenDeleteMany.mockResolvedValue({ count: 1 });
});

describe("unregisterPushToken (S5-07)", () => {
	it("scopes the delete to the caller's own userId", async () => {
		await call(unregisterPushToken, { expoPushToken: "ExpoTok[abc]" }, ctx);

		expect(mockPushTokenDeleteMany).toHaveBeenCalledWith({
			where: { expoPushToken: "ExpoTok[abc]", userId: "user-1" },
		});
	});
});
