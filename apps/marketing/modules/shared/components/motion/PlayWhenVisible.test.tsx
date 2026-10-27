import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PlayWhenVisible } from "./PlayWhenVisible";

describe("PlayWhenVisible", () => {
	it("renders static (no data-playing) on the server so no-JS never loops", () => {
		const html = renderToStaticMarkup(<PlayWhenVisible id="x">hi</PlayWhenVisible>);
		expect(html).toContain('id="x"');
		expect(html).not.toContain("data-playing");
	});
});
