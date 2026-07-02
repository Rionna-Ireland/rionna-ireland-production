import { describe, expect, it } from "vitest";
import { localDocToHydrated } from "../local-doc";

describe("localDocToHydrated", () => {
	it("maps a local image node's src to the renderer's url attr", () => {
		const out = localDocToHydrated({
			type: "doc",
			content: [{ type: "image", attrs: { src: "blob:x", alignment: "left" } }],
		});
		expect(out?.content?.[0]?.attrs?.url).toBe("blob:x");
		expect(out?.content?.[0]?.attrs?.alignment).toBe("left");
	});

	it("maps a local embed node's url onto _resolved so the renderer shows it", () => {
		const out = localDocToHydrated({
			type: "doc",
			content: [{ type: "embed", attrs: { url: "https://youtu.be/x" } }],
		});
		const resolved = out?.content?.[0]?.attrs?._resolved as { url: string };
		expect(resolved.url).toBe("https://youtu.be/x");
	});
});
