import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const dir = resolve(import.meta.dirname, "../../../../../packages/i18n/translations/en");
const read = (f: string) => JSON.parse(readFileSync(resolve(dir, f), "utf8"));

function hits(node: unknown, path = ""): string[] {
	if (typeof node === "string") return node.includes("—") ? [path] : [];
	if (node && typeof node === "object")
		return Object.entries(node).flatMap(([k, v]) => hits(v, path ? `${path}.${k}` : k));
	return [];
}

describe("copy rules: no em dashes in user-facing copy", () => {
	it("marketing.json has none", () => {
		expect(hits(read("marketing.json"))).toEqual([]);
	});
	it("saas.json admin.website.placeholder has none", () => {
		expect(hits(read("saas.json").admin.website.placeholder)).toEqual([]);
	});
});
