import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateFlag, mockEscalate, mockLoggerInfo, mockLoggerWarn } = vi.hoisted(() => ({
	mockCreateFlag: vi.fn(),
	mockEscalate: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("@repo/database", () => ({ createModerationFlag: mockCreateFlag }));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));
vi.mock("../escalate-member", () => ({ maybeEscalateMember: mockEscalate }));

import { recordAutoBlock } from "../record-auto-block";

beforeEach(() => {
	vi.clearAllMocks();
	mockCreateFlag.mockResolvedValue({ id: "f1" });
	mockEscalate.mockResolvedValue(undefined);
});

describe("recordAutoBlock", () => {
	it("records an auto flag with categories and tripped scores, logs without text, then escalates", async () => {
		await recordAutoBlock({
			organizationId: "org1",
			memberId: "m1",
			surface: "comment",
			text: "nasty words here",
			categories: ["hate", "harassment"],
			scores: { hate: 0.91, harassment: 0.95 },
			targetPostId: "p1",
		});

		expect(mockCreateFlag).toHaveBeenCalledWith({
			organizationId: "org1",
			source: "auto",
			surface: "comment",
			memberId: "m1",
			targetPostId: "p1",
			targetSpaceId: null,
			contentExcerpt: "nasty words here",
			matchedTerms: ["hate", "harassment"],
			reason: JSON.stringify({ hate: 0.91, harassment: 0.95 }),
		});
		expect(mockLoggerInfo).toHaveBeenCalledWith("moderation.auto_blocked", {
			organizationId: "org1",
			memberId: "m1",
			surface: "comment",
			categories: ["hate", "harassment"],
			scores: { hate: 0.91, harassment: 0.95 },
		});
		expect(mockEscalate).toHaveBeenCalledWith({ organizationId: "org1", memberId: "m1" });
	});

	it("still escalates when the flag insert fails, and never throws", async () => {
		mockCreateFlag.mockRejectedValue(new Error("db"));
		await expect(
			recordAutoBlock({ organizationId: "org1", memberId: "m1", surface: "post", text: "x", categories: ["hate"], scores: { hate: 0.9 }, targetSpaceId: "s1" }),
		).resolves.toBeUndefined();
		expect(mockLoggerWarn).toHaveBeenCalledWith("moderation.auto_block_record_failed", { organizationId: "org1", error: "Error: db" });
		expect(mockEscalate).toHaveBeenCalled();
	});
});
