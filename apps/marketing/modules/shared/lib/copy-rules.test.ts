import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const dir = resolve(import.meta.dirname, "../../../../../packages/i18n/translations/en");
const read = (f: string) => JSON.parse(readFileSync(resolve(dir, f), "utf8"));

function hits(node: unknown, bad: (s: string) => boolean, path = ""): string[] {
	if (typeof node === "string") return bad(node) ? [path] : [];
	if (node && typeof node === "object")
		return Object.entries(node).flatMap(([k, v]) => hits(v, bad, path ? `${path}.${k}` : k));
	return [];
}
const emDash = (s: string) => s.includes("—");
const ownership = (s: string) => /\bown(er|ers|ership)\b/i.test(s);
const lorem = (s: string) => /lorem/i.test(s);

describe("copy rules: no em dashes in user-facing copy", () => {
	it("marketing.json has none", () => {
		expect(hits(read("marketing.json"), emDash)).toEqual([]);
	});
	it("saas.json has none", () => {
		expect(hits(read("saas.json"), emDash)).toEqual([]);
	});
});

describe("copy rules: no ownership wording", () => {
	it("marketing.json has none", () => {
		expect(hits(read("marketing.json"), ownership)).toEqual([]);
	});
	it("saas.json admin.website.placeholder has none", () => {
		expect(hits(read("saas.json").admin.website.placeholder, ownership)).toEqual([]);
	});
});

describe("copy rules: waitlist is live, never lorem", () => {
	it("waitlist keys contain no lorem", () => {
		expect(hits(read("marketing.json").waitlist, lorem)).toEqual([]);
	});
});

describe("copy rules: page meta is real copy", () => {
	it("every *.meta block has no lorem", () => {
		const m = read("marketing.json");
		const metas = Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v as any).meta]));
		expect(Object.keys(metas).filter((k) => metas[k])).toEqual(
			expect.arrayContaining(["about", "membership", "news", "events", "contact"]),
		);
		expect(hits(metas, lorem)).toEqual([]);
	});
});
