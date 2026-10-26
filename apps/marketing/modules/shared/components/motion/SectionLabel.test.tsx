import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { chapterNumbering } from "./chapters";
import { SectionLabel } from "./SectionLabel";

describe("SectionLabel", () => {
	it("zero-pads and uses a slash, not a dash", () => {
		const html = renderToStaticMarkup(<SectionLabel index={1} label="Our story" />);
		expect(html).toContain("01 / Our story");
		expect(html).not.toContain("—");
	});
});

describe("chapterNumbering", () => {
	it("numbers five chapters with founders", () => {
		const c = chapterNumbering(true);
		expect(c.map((x) => x.index)).toEqual([1, 2, 3, 4, 5]);
		expect(c.map((x) => x.id)).toContain("people");
	});
	it("closes up without founders", () => {
		const c = chapterNumbering(false);
		expect(c.map((x) => x.index)).toEqual([1, 2, 3, 4]);
		expect(c.find((x) => x.id === "people")).toBeUndefined();
		expect(c.at(-1)).toMatchObject({ id: "believe", index: 4 });
	});
});
