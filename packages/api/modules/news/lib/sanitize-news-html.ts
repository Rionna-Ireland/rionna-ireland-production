import sanitizeHtml from "sanitize-html";

/**
 * Server-side sanitization for news `contentHtml` (S5-09 Task 3.3, audit F5).
 * The HTML renders on the PUBLIC marketing site, and Novel's sanitization is
 * client-side only — so the write path is the trust boundary. The allowlist
 * mirrors what the Novel/TipTap composer can author (CIRCLE_BLOCKS in spirit):
 * headings, lists, blockquote, code, images, links, and inline marks.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"p",
		"ul",
		"ol",
		"li",
		"blockquote",
		"pre",
		"code",
		"hr",
		"br",
		"strong",
		"b",
		"em",
		"i",
		"u",
		"s",
		"del",
		"a",
		"img",
	],
	allowedAttributes: {
		a: ["href", "target", "rel"],
		img: ["src", "alt", "width"],
	},
	allowedSchemes: ["http", "https", "mailto"],
	allowedSchemesByTag: { img: ["http", "https"] },
};

export function sanitizeNewsHtml(html: string): string {
	return sanitizeHtml(html, SANITIZE_OPTIONS);
}
