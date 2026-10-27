import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").replace(
	/\/\*[\s\S]*?\*\//g,
	"",
);

/** Rules that hide content (opacity 0, clip, masked word) with their enclosing at-rule chain. */
function hidingRules() {
	const out: { selector: string; chain: string[] }[] = [];
	const stack: { head: string; start: number }[] = [];
	let head = 0;
	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (c === "{") {
			stack.push({ head: css.slice(head, i).trim(), start: i });
			head = i + 1;
		} else if (c === "}") {
			const top = stack.pop();
			if (top && !top.head.startsWith("@")) {
				const body = css.slice(top.start + 1, i);
				if (
					/(^|[;\s])opacity:\s*0;/.test(body) ||
					/clip-path:\s*inset\(100%/.test(body) ||
					/translate3d\(0,\s*(130%|calc\(100% \+)/.test(body)
				) {
					out.push({ selector: top.head, chain: stack.map((s) => s.head) });
				}
			}
			head = i + 1;
		} else if (c === ";") head = i + 1;
	}
	return out;
}

// State-driven, not reveal-gated: decorative alternate mosaic, nav glass layers, active-screen crossfade.
const EXEMPT = [/^\.ch-swap\b/, /^\.nav-glass/, /^\.fs-screen$/];

describe("hide-before-reveal stays inside the scripting + no-preference gate", () => {
	const rules = hidingRules().filter(
		(r) =>
			!r.chain.some((h) => h.startsWith("@keyframes")) &&
			!EXEMPT.some((e) => e.test(r.selector)),
	);

	it("finds hiding rules to check", () => {
		expect(rules.length).toBeGreaterThan(2);
	});

	it.each(rules.map((r) => [r.selector, r.chain] as const))("%s", (_selector, chain) => {
		const gate = chain.join(" ");
		expect(gate).toContain("prefers-reduced-motion: no-preference");
		// Scroll-driven rules need no JS hydration (CSS-only), so `@supports` also counts.
		expect(gate.includes("scripting: enabled") || gate.includes("animation-timeline")).toBe(
			true,
		);
	});
});
