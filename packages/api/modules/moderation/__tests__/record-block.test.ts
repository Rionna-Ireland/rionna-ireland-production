import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateModerationFlag, mockLoggerInfo, mockLoggerWarn } = vi.hoisted(() => ({
	mockCreateModerationFlag: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

// Mock @repo/database wholesale (no importActual) — the real module needs DATABASE_URL.
vi.mock("@repo/database", () => ({
	createModerationFlag: mockCreateModerationFlag,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));

import { recordBlock } from "../record-block";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("recordBlock", () => {
	it("records the flag with the expected payload", async () => {
		mockCreateModerationFlag.mockResolvedValue({ id: "flag1" });
		await recordBlock({
			organizationId: "org1",
			memberId: "m1",
			surface: "post",
			text: "what a cunt this is",
			matches: ["cunt"],
			targetPostId: "p1",
		});
		expect(mockCreateModerationFlag).toHaveBeenCalledWith({
			organizationId: "org1",
			source: "blocked",
			surface: "post",
			memberId: "m1",
			targetPostId: "p1",
			targetSpaceId: null,
			contentExcerpt: "what a cunt this is",
			matchedTerms: ["cunt"],
		});
		expect(mockLoggerInfo).toHaveBeenCalledWith("moderation.blocked", {
			organizationId: "org1",
			memberId: "m1",
			surface: "post",
			matches: ["cunt"],
		});
	});

	it("defaults targetPostId/targetSpaceId to null when omitted", async () => {
		mockCreateModerationFlag.mockResolvedValue({ id: "flag2" });
		await recordBlock({
			organizationId: "org1",
			memberId: "m1",
			surface: "comment",
			text: "shit",
			matches: ["shit"],
		});
		expect(mockCreateModerationFlag).toHaveBeenCalledWith(
			expect.objectContaining({ targetPostId: null, targetSpaceId: null }),
		);
	});

	it("does not throw when createModerationFlag rejects", async () => {
		mockCreateModerationFlag.mockRejectedValue(new Error("db down"));
		await expect(
			recordBlock({
				organizationId: "org1",
				memberId: "m1",
				surface: "post",
				text: "shit",
				matches: ["shit"],
			}),
		).resolves.toBeUndefined();
		expect(mockLoggerWarn).toHaveBeenCalledWith("moderation.block_record_failed", {
			organizationId: "org1",
			error: "Error: db down",
		});
	});
});
