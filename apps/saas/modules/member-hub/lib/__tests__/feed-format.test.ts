import { describe, expect, it } from "vitest";

import { formatFeedDate } from "../feed-format";

describe("formatFeedDate", () => {
	it("returns '' for null / undefined / invalid", () => {
		expect(formatFeedDate(null)).toBe("");
		expect(formatFeedDate(undefined)).toBe("");
		expect(formatFeedDate("nope")).toBe("");
	});
	it("formats an ISO string", () => {
		const out = formatFeedDate("2026-07-15T12:00:00Z");
		expect(out).toContain("2026");
		expect(out).toContain("Jul");
	});
});
