import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StatsSection } from "./StatsSection";

describe("StatsSection", () => {
	it("renders nothing when there are no stats", () => {
		expect(renderToStaticMarkup(<StatsSection stats={[]} />)).toBe("");
	});

	it("renders every stat value when set", () => {
		const stats = ["340+", "€48k", "12", "2"].map((value, i) => ({ value, label: `L${i}` }));
		const html = renderToStaticMarkup(<StatsSection stats={stats} />);
		for (const s of stats) expect(html).toContain(s.value);
	});
});
