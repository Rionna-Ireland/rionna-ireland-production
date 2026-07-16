/**
 * sanitizeNewsHtml (S5-09 Task 3.3, audit F5) — news `contentHtml` executes on the
 * PUBLIC marketing site, so it must be sanitized server-side on write. The allowlist
 * mirrors the Novel/TipTap output set (CIRCLE_BLOCKS in spirit): headings, lists,
 * blockquote, code, img src/alt/width, a href, and inline marks.
 */

import { describe, expect, it } from "vitest";

import { sanitizeNewsHtml } from "../lib/sanitize-news-html";

describe("sanitizeNewsHtml (S5-09 / F5)", () => {
	it("strips script tags and their content", () => {
		const out = sanitizeNewsHtml('<p>hello</p><script>alert("xss")</script>');
		expect(out).toBe("<p>hello</p>");
	});

	it("strips event-handler attributes but keeps the image", () => {
		const out = sanitizeNewsHtml('<img src="https://cdn.example/a.png" alt="a" width="640" onerror="alert(1)" />');
		expect(out).toContain('src="https://cdn.example/a.png"');
		expect(out).toContain('alt="a"');
		expect(out).toContain('width="640"');
		expect(out).not.toContain("onerror");
	});

	it("drops javascript: hrefs but keeps the link text", () => {
		const out = sanitizeNewsHtml('<a href="javascript:alert(1)">click</a>');
		expect(out).not.toContain("javascript:");
		expect(out).toContain("click");
	});

	it("keeps https links", () => {
		const out = sanitizeNewsHtml('<a href="https://example.com/race">race</a>');
		expect(out).toContain('href="https://example.com/race"');
	});

	it("keeps the Novel/TipTap structural set", () => {
		const html =
			"<h1>Title</h1><h2>Sub</h2><h3>Minor</h3><p>Body <strong>bold</strong> <em>italic</em> <u>under</u> <s>strike</s> <code>x</code></p><ul><li>a</li></ul><ol><li>b</li></ol><blockquote><p>quote</p></blockquote><pre><code>block</code></pre><hr /><p>line<br />break</p>";
		expect(sanitizeNewsHtml(html)).toBe(html);
	});

	it("strips iframes, styles and unknown tags entirely", () => {
		const out = sanitizeNewsHtml(
			'<p>ok</p><iframe src="https://evil.example"></iframe><style>p{display:none}</style><marquee>nope</marquee>',
		);
		expect(out).not.toContain("iframe");
		expect(out).not.toContain("display:none");
		expect(out).not.toContain("marquee");
		expect(out).toContain("<p>ok</p>");
	});

	it("strips style and class attributes", () => {
		const out = sanitizeNewsHtml('<p style="color:red" class="x" id="y">text</p>');
		expect(out).toBe("<p>text</p>");
	});
});
