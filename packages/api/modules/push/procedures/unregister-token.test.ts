/**
 * unregisterPushToken (S17-03 / M-06): works without a session so the mobile
 * app's 401 tear-down can still stop pushes to a signed-out device.
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

const ctx = { context: { headers: new Headers() } };

beforeEach(() => {
	vi.clearAllMocks();
	mockGetSession.mockResolvedValue(null);
	mockPushTokenDeleteMany.mockResolvedValue({ count: 1 });
});

describe("unregisterPushToken (S17-03)", () => {
	it("deletes by token alone when there is no session", async () => {
		await expect(
			call(unregisterPushToken, { expoPushToken: "ExpoTok[abc]" }, ctx),
		).resolves.toEqual({
			success: true,
		});

		expect(mockPushTokenDeleteMany).toHaveBeenCalledWith({
			where: { expoPushToken: "ExpoTok[abc]" },
		});
	});

	it("rejects an empty token without touching the database", async () => {
		await expect(call(unregisterPushToken, { expoPushToken: "" }, ctx)).rejects.toThrow();
		expect(mockPushTokenDeleteMany).not.toHaveBeenCalled();
	});
});
