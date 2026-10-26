import { describe, expect, it } from "vitest";

import { parseStatValue } from "./parseStatValue";

describe("parseStatValue", () => {
	it.each([
		["340+", { prefix: "", number: 340, decimals: 0, suffix: "+", grouping: false }],
		["€48k", { prefix: "€", number: 48, decimals: 0, suffix: "k", grouping: false }],
		["1,250", { prefix: "", number: 1250, decimals: 0, suffix: "", grouping: true }],
		["2.5m", { prefix: "", number: 2.5, decimals: 1, suffix: "m", grouping: false }],
		["Group 1", { prefix: "Group ", number: 1, decimals: 0, suffix: "", grouping: false }],
		["12 / 40", { prefix: "", number: 12, decimals: 0, suffix: " / 40", grouping: false }],
	])("parses %j", (input, expected) => {
		expect(parseStatValue(input)).toEqual(expected);
	});

	it.each(["Lots", "  ", "", "€"])("returns null for %j", (input) => {
		expect(parseStatValue(input)).toBeNull();
	});
});
