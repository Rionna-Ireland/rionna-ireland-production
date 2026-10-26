import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Arrival } from "./Arrival";
import { ARRIVAL_INLINE_SCRIPT, shouldPlayArrival } from "./arrival-logic";

function memory() {
	const m = new Map<string, string>();
	return {
		getItem: (k: string) => m.get(k) ?? null,
		setItem: (k: string, v: string) => void m.set(k, v),
	};
}

describe("shouldPlayArrival", () => {
	it("plays once per storage", () => {
		const s = memory();
		expect(shouldPlayArrival(s)).toBe(true);
		expect(shouldPlayArrival(s)).toBe(false);
	});

	it("plays when storage is unavailable", () => {
		expect(shouldPlayArrival(null)).toBe(true);
	});

	it("plays when storage throws", () => {
		const s = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
		};
		expect(shouldPlayArrival(s)).toBe(true);
	});
});

describe("ARRIVAL_INLINE_SCRIPT", () => {
	it("behaves like shouldPlayArrival", () => {
		const run = (stored: string | null) => {
			const doc = { documentElement: { dataset: {} as Record<string, string> } };
			const sets: string[] = [];
			const sessionStorage = {
				getItem: () => stored,
				setItem: (k: string, v: string) => void sets.push(`${k}=${v}`),
			};
			new Function("document", "sessionStorage", ARRIVAL_INLINE_SCRIPT)(doc, sessionStorage);
			return { arrival: doc.documentElement.dataset.arrival, sets };
		};
		expect(run("1")).toEqual({ arrival: "seen", sets: [] });
		expect(run(null)).toEqual({ arrival: undefined, sets: ["rionna:arrived=1"] });
	});
});

describe("Arrival", () => {
	it("renders the drawn outline and the tagline, hidden from AT", () => {
		const html = renderToStaticMarkup(<Arrival />);
		expect(html).toMatch(/<path[^>]*pathLength="1"/);
		expect(html).toContain("Open the gates");
		expect(html).toContain('aria-hidden="true"');
	});
});
