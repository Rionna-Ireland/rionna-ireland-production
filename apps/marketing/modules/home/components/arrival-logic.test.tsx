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

	it("ignores non-home paths without touching the flag", () => {
		const s = memory();
		expect(shouldPlayArrival(s, "/en/news")).toBe(false);
		expect(shouldPlayArrival(s, "/en/")).toBe(true);
		expect(shouldPlayArrival(s, "/en")).toBe(false);
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
		const run = (stored: string | null, pathname = "/en") => {
			const doc = { documentElement: { dataset: {} as Record<string, string> } };
			const sets: string[] = [];
			const sessionStorage = {
				getItem: () => stored,
				setItem: (k: string, v: string) => void sets.push(`${k}=${v}`),
			};
			new Function("document", "sessionStorage", "location", ARRIVAL_INLINE_SCRIPT)(
				doc,
				sessionStorage,
				{ pathname },
			);
			return { arrival: doc.documentElement.dataset.arrival, sets };
		};
		expect(run("1")).toEqual({ arrival: "seen", sets: [] });
		expect(run(null)).toEqual({ arrival: undefined, sets: ["rionna:arrived=1"] });
		expect(run("1", "/en/news")).toEqual({ arrival: undefined, sets: [] });
		expect(run(null, "/en/news")).toEqual({ arrival: undefined, sets: [] });
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
