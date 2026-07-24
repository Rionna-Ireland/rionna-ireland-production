import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	mockCreate,
	mockUpdate,
	mockUpdateMany,
	mockFindFirst,
	mockGetAudienceTokens,
	mockChunkPushNotifications,
	mockSendPushNotificationsAsync,
	mockLogger,
} = vi.hoisted(() => ({
	mockCreate: vi.fn(),
	mockUpdate: vi.fn(),
	mockUpdateMany: vi.fn(),
	mockFindFirst: vi.fn(),
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
			updateMany: (...args: unknown[]) => mockUpdateMany(...args),
			findFirst: (...args: unknown[]) => mockFindFirst(...args),
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
		mockCreate.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-2" });
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
		mockCreate.mockRejectedValueOnce(duplicateError).mockResolvedValueOnce({ id: "log-2" });
		// The existing row is QUEUED/SENT — not re-claimable.
		mockUpdateMany.mockResolvedValue({ count: 0 });
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
		mockCreate.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-2" });
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

	// ── delivery summary + FAILED re-claim (FABLE_AUDIT C4) ──────────

	it("returns a delivery summary on success", async () => {
		mockGetAudienceTokens.mockResolvedValue([
			{ expoPushToken: "ExponentPushToken[a]", userId: "user-1" },
			{ expoPushToken: "ExponentPushToken[b]", userId: "user-2" },
		]);
		mockCreate.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-2" });
		mockSendPushNotificationsAsync.mockResolvedValueOnce([
			{ status: "ok" },
			{ status: "error", message: "DeviceNotRegistered" },
		]);

		const result = await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-3",
			title: "T",
			body: "B",
		});

		expect(result).toEqual({ attempted: 2, sent: 1, failed: 1 });
	});

	it("reports total failure when the Expo chunk send throws", async () => {
		mockGetAudienceTokens.mockResolvedValue([
			{ expoPushToken: "ExponentPushToken[a]", userId: "user-1" },
			{ expoPushToken: "ExponentPushToken[b]", userId: "user-2" },
		]);
		mockCreate.mockResolvedValueOnce({ id: "log-1" }).mockResolvedValueOnce({ id: "log-2" });
		mockSendPushNotificationsAsync.mockRejectedValueOnce(new Error("expo down"));

		const result = await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-4",
			title: "T",
			body: "B",
		});

		expect(result).toEqual({ attempted: 2, sent: 0, failed: 2 });
	});

	it("reports attempted: 0 when every reservation was already handled", async () => {
		const duplicateError = Object.assign(new Error("dup"), { code: "P2002" });
		mockGetAudienceTokens.mockResolvedValue([
			{ expoPushToken: "ExponentPushToken[a]", userId: "user-1" },
		]);
		mockCreate.mockRejectedValueOnce(duplicateError);
		mockUpdateMany.mockResolvedValue({ count: 0 });

		const result = await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-5",
			title: "T",
			body: "B",
		});

		expect(result).toEqual({ attempted: 0, sent: 0, failed: 0 });
		expect(mockSendPushNotificationsAsync).not.toHaveBeenCalled();
	});

	it("re-claims a FAILED reservation so a retry actually sends", async () => {
		const duplicateError = Object.assign(new Error("dup"), { code: "P2002" });
		mockGetAudienceTokens.mockResolvedValue([
			{ expoPushToken: "ExponentPushToken[a]", userId: "user-1" },
		]);
		mockCreate.mockRejectedValueOnce(duplicateError);
		// A prior failed attempt left a FAILED row — the retry re-claims it.
		mockUpdateMany.mockResolvedValue({ count: 1 });
		mockFindFirst.mockResolvedValue({ id: "log-failed" });
		mockSendPushNotificationsAsync.mockResolvedValueOnce([{ status: "ok" }]);

		const result = await sendPush({
			organizationId: "org-1",
			triggerType: "TRAINER_POST",
			triggerRefId: "notif-6",
			title: "T",
			body: "B",
		});

		expect(result).toEqual({ attempted: 1, sent: 1, failed: 0 });
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: {
				organizationId: "org-1",
				expoPushToken: "ExponentPushToken[a]",
				triggerType: "TRAINER_POST",
				triggerRefId: "notif-6",
				status: "FAILED",
			},
			data: { status: "QUEUED", error: null },
		});
		expect(mockUpdate).toHaveBeenCalledWith({
			where: { id: "log-failed" },
			data: expect.objectContaining({ status: "SENT" }),
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
