import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockClassifyText, mockLoggerInfo, mockLoggerWarn } = vi.hoisted(() => ({
	mockClassifyText: vi.fn(),
	mockLoggerInfo: vi.fn(),
	mockLoggerWarn: vi.fn(),
}));

vi.mock("../openai-moderation", () => ({ classifyText: mockClassifyText }));
vi.mock("@repo/logs", () => ({
	logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: vi.fn(), log: vi.fn() },
}));

import { AUTO_MODERATION_THRESHOLDS, MODERATION_CATEGORIES, trippedCategories } from "../auto-thresholds";
import { screenAuto } from "../screen-auto";
import { CAUGHT_ABUSE_SAMPLES, LEGIT_SAMPLES } from "./fixtures/probe-scores";

const CTX = { organizationId: "org1", memberId: "m1", surface: "post" as const };

beforeEach(() => {
	vi.clearAllMocks();
});

describe("auto thresholds vs the S12-07 probe", () => {
	it("defines a threshold for every category", () => {
		for (const c of MODERATION_CATEGORIES) {
			expect(AUTO_MODERATION_THRESHOLDS[c]).toBeGreaterThan(0);
		}
	});

	it.each(LEGIT_SAMPLES)("never blocks legit racing text $id ($note)", ({ scores }) => {
		expect(trippedCategories(scores)).toEqual([]);
	});

	it.each(CAUGHT_ABUSE_SAMPLES)("blocks abusive sample $id ($note)", ({ scores }) => {
		expect(trippedCategories(scores).length).toBeGreaterThan(0);
	});
});

describe("screenAuto", () => {
	it("blocks with the tripped categories and only their scores", async () => {
		mockClassifyText.mockResolvedValue({ ok: true, scores: { hate: 0.99, harassment: 0.5, violence: 0.1 } });

		const result = await screenAuto("text", CTX);

		expect(result).toEqual({ allowed: false, categories: ["hate"], scores: { hate: 0.99 } });
	});

	it("allows below threshold", async () => {
		mockClassifyText.mockResolvedValue({ ok: true, scores: { violence: 0.2 } });
		expect(await screenAuto("text", CTX)).toEqual({ allowed: true });
		expect(mockLoggerInfo).not.toHaveBeenCalled();
	});

	it("logs a near-miss (no text) when a category is ≥ 0.5 but under threshold", async () => {
		mockClassifyText.mockResolvedValue({ ok: true, scores: { violence: 0.92, harassment: 0.1 } });

		expect(await screenAuto("I could kill the handicapper", CTX)).toEqual({ allowed: true });
		expect(mockLoggerInfo).toHaveBeenCalledWith("moderation.auto_near_miss", {
			organizationId: "org1",
			memberId: "m1",
			surface: "post",
			scores: { violence: 0.92 },
		});
		expect(JSON.stringify(mockLoggerInfo.mock.calls)).not.toContain("handicapper");
	});

	it("fails open and warns when the classifier is unavailable", async () => {
		mockClassifyText.mockResolvedValue({ ok: false, reason: "http_error", status: 429 });

		expect(await screenAuto("text", CTX)).toEqual({ allowed: true });
		expect(mockLoggerWarn).toHaveBeenCalledWith("moderation.auto_unavailable", {
			organizationId: "org1",
			memberId: "m1",
			surface: "post",
			reason: "http_error",
			status: 429,
		});
	});

	it("fails open if the classifier throws", async () => {
		mockClassifyText.mockRejectedValue(new Error("boom"));
		expect(await screenAuto("text", CTX)).toEqual({ allowed: true });
		expect(mockLoggerWarn).toHaveBeenCalledWith(
			"moderation.auto_unavailable",
			expect.objectContaining({ reason: "exception" }),
		);
	});

	it("allows empty / whitespace text without calling the classifier", async () => {
		expect(await screenAuto("  \n ", CTX)).toEqual({ allowed: true });
		expect(mockClassifyText).not.toHaveBeenCalled();
	});
});
