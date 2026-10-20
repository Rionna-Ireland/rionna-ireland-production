import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FoundersSection } from "./FoundersSection";
import { MembershipFaq, pickItems } from "./MembershipFaq";

describe("FoundersSection", () => {
	it("is absent with no founders", () => {
		expect(renderToStaticMarkup(<FoundersSection founders={[]} label="The people" />)).toBe("");
	});

	it("renders every founder", () => {
		const founders = [
			{ name: "Ada Lovelace", role: "Co-founder", bio: "b1" },
			{ name: "Grace Hopper", role: "Co-founder", bio: "b2" },
		];
		const html = renderToStaticMarkup(
			<FoundersSection founders={founders} label="The people" />,
		);
		expect(html).toContain("Ada Lovelace");
		expect(html).toContain("Grace Hopper");
		expect(html).toContain("AL");
	});
});

describe("FAQ / inclusions selection", () => {
	const fallback = () => [{ question: "Fallback Q", answer: "Fallback A" }];

	it("uses fallback when admin list is empty", () => {
		const html = renderToStaticMarkup(<MembershipFaq items={pickItems([], fallback)} />);
		expect(html).toContain("Fallback Q");
	});

	it("uses admin items when set", () => {
		const admin = [{ question: "Admin Q", answer: "Admin A" }];
		const html = renderToStaticMarkup(<MembershipFaq items={pickItems(admin, fallback)} />);
		expect(html).toContain("Admin Q");
		expect(html).not.toContain("Fallback Q");
		expect(pickItems(["x"], () => ["fb"])).toEqual(["x"]);
		expect(pickItems([], () => ["fb"])).toEqual(["fb"]);
	});
});
