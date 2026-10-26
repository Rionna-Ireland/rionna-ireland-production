import { describe, expect, it } from "vitest";

import { dayKey, monthCells, cellDealDelay } from "./calendar";

describe("monthCells", () => {
	it("starts on Monday: Oct 2026 begins on a Thursday, so index 3 is the 1st", () => {
		const cells = monthCells(2026, 9);
		expect(cells[3]).toMatchObject({ day: 1, key: "2026-10-01" });
		expect(cells.slice(0, 3).every((c) => c === null)).toBe(true);
		expect(cells.filter(Boolean)).toHaveLength(31);
	});
	it("pads the final week to 7", () => {
		expect(monthCells(2026, 9).length % 7).toBe(0);
	});
	it("a month starting on Monday has no leading blanks (Jun 2026)", () => {
		expect(monthCells(2026, 5)[0]).toMatchObject({ day: 1 });
	});
});

describe("cellDealDelay", () => {
	it("maps the index to the diagonal deal on a 7 column grid", () => {
		expect(cellDealDelay(0)).toBe(0);
		expect(cellDealDelay(3)).toBe(270); // the 1st of Oct 2026
		expect(cellDealDelay(7)).toBe(90); // second row, first column
		expect(cellDealDelay(10)).toBe(360); // row 1, column 3
	});
});

describe("dayKey", () => {
	it("keys in Europe/Dublin, not UTC", () => {
		expect(dayKey("2026-07-01T23:30:00Z")).toBe("2026-07-02");
		expect(dayKey("2026-01-01T23:30:00Z")).toBe("2026-01-01");
	});
});
