import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockCreate,
	mockUpdate,
	mockGetAudienceTokens,
	mockChunkPushNotifications,
	mockSendPushNotificationsAsync,
	mockLogger,
} = vi.hoisted(() => ({
	mockCreate: vi.fn(),
	mockUpdate: vi.fn(),
	mockGetAudienceTokens: vi.fn(),
	mockChunkPushNotifications: vi.fn((messages: unknown[]) => [messages]),
	mockSendPushNotificationsAsync: vi.fn(),
	mockLogger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		log: vi.fn(),
	},
}));

vi.mock("@repo/database", () => ({
	db: {
		pushLog: {
			create: (...args: unknown[]) => mockCreate(...args),
			update: (...args: unknown[]) => mockUpdate(...args),
		},
	},
}));

vi.mock("@repo/logs", () => ({
	logger: mockLogger,
}));

vi.mock("../audience", () => ({
	getAudienceTokens: (...args: unknown[]) => mockGetAudienceTokens(...args),
}));

vi.mock("expo-server-sdk", () => ({
	default: class MockExpo {
		chunkPushNotifications(messages: unknown[]) {
			return mockChunkPushNotifications(messages);
		}

		sendPushNotificationsAsync(chunk: unknown[]) {
			return mockSendPushNotificationsAsync(chunk);
		}
	},
}));

import { sendPush } from "../service";

describe("sendPush", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns early when no audience tokens match", async () => {
		mockGetAudienceTokens.mockResolvedValue([]);

		await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-1",
			title: "New trainer update",
			body: "Body",
		});

		expect(mockCreate).not.toHaveBeenCalled();
		expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
	});

	it("reserves push rows before Expo send and updates them with receipts", async () => {
		mockGetAudienceTokens.mockResolvedValue([
			{ expoPushToken: "ExponentPushToken[a]", userId: "user-1" },
			{ expoPushToken: "ExponentPushToken[b]", userId: "user-2" },
		]);
		mockCreate
			.mockResolvedValueOnce({ id: "log-1" })
			.mockResolvedValueOnce({ id: "log-2" });
		mockSendPushNotificationsAsync.mockResolvedValueOnce([
			{ status: "ok" },
			{ status: "error", message: "DeviceNotRegistered" },
		]);

		await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-1",
			title: "New trainer update",
			body: "Body",
			data: { screen: "community" },
		});

		expect(mockCreate).toHaveBeenCalledTimes(2);
		expect(mockCreate).toHaveBeenNthCalledWith(1, {
			data: expect.objectContaining({
				organizationId: "org-1",
				userId: "user-1",
				expoPushToken: "ExponentPushToken[a]",
				triggerType: "TRAINER_POST",
				triggerRefId: "notif-1",
				status: "QUEUED",
			}),
			select: { id: true },
		});
		expect(mockSendPushNotificationsAsync).toHaveBeenCalledTimes(1);
		expect(mockUpdate).toHaveBeenNthCalledWith(1, {
			where: { id: "log-1" },
			data: expect.objectContaining({
				status: "SENT",
				error: null,
			}),
		});
		expect(mockUpdate).toHaveBeenNthCalledWith(2, {
			where: { id: "log-2" },
			data: expect.objectContaining({
				status: "FAILED",
				error: "DeviceNotRegistered",
			}),
		});
	});

	it("skips duplicate reservations when the dedup unique key is hit", async () => {
		const duplicateError = Object.assign(new Error("dup"), { code: "P2002" });
		mockGetAudienceTokens.mockResolvedValue([
			{ expoPushToken: "ExponentPushToken[a]", userId: "user-1" },
			{ expoPushToken: "ExponentPushToken[b]", userId: "user-2" },
		]);
		mockCreate
			.mockRejectedValueOnce(duplicateError)
			.mockResolvedValueOnce({ id: "log-2" });
		mockSendPushNotificationsAsync.mockResolvedValueOnce([{ status: "ok" }]);

		await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-1",
			title: "New trainer update",
			body: "Body",
		});

		const sentChunk = mockSendPushNotificationsAsync.mock.calls[0]?.[0] ?? [];
		expect(sentChunk).toHaveLength(1);
		expect(sentChunk[0]).toMatchObject({
			to: "ExponentPushToken[b]",
			title: "New trainer update",
		});
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		expect(mockLogger.info).toHaveBeenCalledWith(
			"[sendPush] Duplicate trigger already reserved, skipping",
			expect.objectContaining({
				triggerRefId: "notif-1",
				expoPushToken: "ExponentPushToken[a]",
			}),
		);
	});

	it("marks reserved rows failed when Expo send throws", async () => {
		mockGetAudienceTokens.mockResolvedValue([
			{ expoPushToken: "ExponentPushToken[a]", userId: "user-1" },
			{ expoPushToken: "ExponentPushToken[b]", userId: "user-2" },
		]);
		mockCreate
			.mockResolvedValueOnce({ id: "log-1" })
			.mockResolvedValueOnce({ id: "log-2" });
		mockSendPushNotificationsAsync.mockRejectedValueOnce(new Error("expo down"));

		await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-2",
			title: "New trainer update",
			body: "Body",
		});

		expect(mockUpdate).toHaveBeenCalledTimes(2);
		expect(mockUpdate).toHaveBeenNthCalledWith(1, {
			where: { id: "log-1" },
			data: expect.objectContaining({
				status: "FAILED",
				error: "expo down",
			}),
		});
		expect(mockUpdate).toHaveBeenNthCalledWith(2, {
			where: { id: "log-2" },
			data: expect.objectContaining({
				status: "FAILED",
				error: "expo down",
			}),
		});
	});

	// ── followersOfHorseId targeting (S8-03) ─────────────────────────

	it("forwards followersOfHorseId to getAudienceTokens when provided", async () => {
		mockGetAudienceTokens.mockResolvedValue([]);

		await sendPush({
			organizationId: "org-1",
			triggerType: "HORSE_DECLARED",
			triggerRefId: "entry-1",
			title: "Declared",
			body: "Body",
			followersOfHorseId: "horse-1",
		});

		expect(mockGetAudienceTokens).toHaveBeenCalledWith(
			expect.objectContaining({ followersOfHorseId: "horse-1" }),
		);
	});

	it("omits followersOfHorseId from getAudienceTokens when not provided (org-wide unchanged)", async () => {
		mockGetAudienceTokens.mockResolvedValue([]);

		await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-1",
			title: "New trainer update",
			body: "Body",
		});

		expect(mockGetAudienceTokens).toHaveBeenCalledWith(
			expect.objectContaining({ followersOfHorseId: undefined }),
		);
	});
});
