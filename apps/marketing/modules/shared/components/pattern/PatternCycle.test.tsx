import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CYCLE_PATTERNS, PatternCycle } from "./PatternCycle";

describe("PatternCycle", () => {
	it("stacks one layer per pattern, each with its slot index", () => {
		const html = renderToStaticMarkup(<PatternCycle />);
		expect(html.match(/cyc-layer/g)).toHaveLength(CYCLE_PATTERNS.length);
		expect(html).toContain("--k:0");
		expect(html).toContain(`--k:${CYCLE_PATTERNS.length - 1}`);
		expect(html).toContain("aria-hidden");
	});
});
