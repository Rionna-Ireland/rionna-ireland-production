import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PhotoUnmask } from "./PhotoUnmask";

describe("PhotoUnmask", () => {
	it("renders its children visible in SSR (no-JS shows the photo)", () => {
		const html = renderToStaticMarkup(
			<PhotoUnmask direction="left">
				<img alt="x" src="/a.jpg" />
			</PhotoUnmask>,
		);
		expect(html).toContain("unmask-left");
		expect(html).toContain('src="/a.jpg"');
		expect(html).not.toContain("data-revealed");
	});
	it("immediate uses the page-time class", () => {
		expect(renderToStaticMarkup(<PhotoUnmask immediate>x</PhotoUnmask>)).toContain(
			"unmask-now",
		);
	});
});
