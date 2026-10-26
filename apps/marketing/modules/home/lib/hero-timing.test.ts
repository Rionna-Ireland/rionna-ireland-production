import { describe, expect, it } from "vitest";

import { heroWordStepMs } from "./hero-timing";

describe("heroWordStepMs", () => {
	it("keeps 60ms for short titles", () => {
		expect(heroWordStepMs(1)).toBe(0);
		expect(heroWordStepMs(2)).toBe(60);
		expect(heroWordStepMs(3)).toBe(50);
	});
	it("never lets the last word end after 900ms", () => {
		for (let n = 1; n < 40; n++) {
			expect(100 + (n - 1) * heroWordStepMs(n) + 700).toBeLessThanOrEqual(900);
		}
	});
});
