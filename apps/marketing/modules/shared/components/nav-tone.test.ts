import { describe, expect, it } from "vitest";

import { toneAt } from "./nav-tone";

const dark = { top: 0, bottom: 500, tone: "dark" as const };
const light = { top: 500, bottom: 900, tone: "light" as const };

describe("toneAt", () => {
	it("returns the tone of the section containing y", () => {
		expect(toneAt([dark, light], 100)).toBe("dark");
	});
	it("returns the fallback between sections", () => {
		expect(toneAt([dark, { ...light, top: 600 }], 550)).toBe("light");
		expect(toneAt([dark, { ...light, top: 600 }], 550, "dark")).toBe("dark");
	});
	it("lets the later overlapping section win", () => {
		expect(toneAt([dark, { top: 400, bottom: 800, tone: "light" }], 450)).toBe("light");
	});
});
