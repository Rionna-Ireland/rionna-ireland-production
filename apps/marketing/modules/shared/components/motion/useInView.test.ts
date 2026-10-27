import { describe, expect, it } from "vitest";

import { isEntryInView } from "./useInView";

const entry = (isIntersecting: boolean, ratio: number, height: number, rootHeight = 800) =>
	({
		isIntersecting,
		intersectionRatio: ratio,
		boundingClientRect: { height },
		rootBounds: { height: rootHeight },
	}) as unknown as IntersectionObserverEntry;

describe("isEntryInView", () => {
	it("needs intersection", () => {
		expect(isEntryInView(entry(false, 0, 100), 0.15)).toBe(false);
	});
	it("needs the threshold ratio for normal elements", () => {
		expect(isEntryInView(entry(true, 0.05, 100), 0.15)).toBe(false);
		expect(isEntryInView(entry(true, 0.2, 100), 0.15)).toBe(true);
	});
	it("treats an element taller than the viewport as in view once it intersects", () => {
		expect(isEntryInView(entry(true, 0.05, 2400), 0.15)).toBe(true);
	});
});
