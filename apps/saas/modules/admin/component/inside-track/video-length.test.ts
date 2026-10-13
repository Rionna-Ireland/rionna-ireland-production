import { describe, expect, it } from "vitest";

import { minutesInputToSeconds, secondsToMinutesInput } from "./video-length";

describe("video length conversion (S13-13)", () => {
	it("converts minutes to whole seconds", () => {
		expect(minutesInputToSeconds("4")).toBe(240);
		expect(minutesInputToSeconds(" 4.5 ")).toBe(270);
		expect(minutesInputToSeconds("0.01")).toBe(1);
	});
	it("treats blank as clear and junk as invalid", () => {
		expect(minutesInputToSeconds("")).toBeNull();
		expect(minutesInputToSeconds("   ")).toBeNull();
		expect(minutesInputToSeconds("abc")).toBeUndefined();
		expect(minutesInputToSeconds("0")).toBeUndefined();
		expect(minutesInputToSeconds("-2")).toBeUndefined();
		expect(minutesInputToSeconds("99999")).toBeUndefined();
	});
	it("renders stored seconds as minutes", () => {
		expect(secondsToMinutesInput(240)).toBe("4");
		expect(secondsToMinutesInput(270)).toBe("4.5");
		expect(secondsToMinutesInput(null)).toBe("");
		expect(secondsToMinutesInput(undefined)).toBe("");
	});
});
