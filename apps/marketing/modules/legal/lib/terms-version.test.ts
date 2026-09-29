import { readFileSync } from "node:fs";
import path from "node:path";

import { CURRENT_TERMS_VERSION } from "@repo/utils";
import { describe, expect, it } from "vitest";

/**
 * S12-10: the version members accept (CURRENT_TERMS_VERSION) must be bumped
 * together with the published terms copy.
 */
function readFrontmatterField(filePath: string, field: string): string | undefined {
	const source = readFileSync(filePath, "utf8");
	const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? "";
	const line = frontmatter.split(/\r?\n/).find((candidate) => candidate.startsWith(`${field}:`));
	return line
		?.slice(field.length + 1)
		.trim()
		.replace(/^["']|["']$/g, "");
}

describe("terms version", () => {
	it("terms.md frontmatter version matches CURRENT_TERMS_VERSION", () => {
		const termsPath = path.resolve(import.meta.dirname, "../../../content/legal/terms.md");
		expect(readFrontmatterField(termsPath, "version")).toBe(CURRENT_TERMS_VERSION);
	});
});
