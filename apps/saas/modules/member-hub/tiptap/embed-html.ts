/**
 * Circle oEmbed `embed.html` reaches us as raw provider HTML. Rendering it via
 * dangerouslySetInnerHTML is a stored-XSS surface (Kimi H3): admin-pasted URL →
 * Circle's oEmbed fetch → HTML executed in every member's browser.
 *
 * Instead of sanitizing arbitrary HTML (DOMPurify needs a DOM, and these
 * renderers run as Server Components), we extract the iframe `src`, validate it
 * is a well-formed https URL, and let the renderer rebuild its own <iframe>.
 * React never executes <script> tags injected via dangerouslySetInnerHTML, so
 * iframe embeds are the only kind that rendered before — script/blockquote
 * embeds already degraded and now fall back to the "View media" link.
 */
export function extractEmbedIframeSrc(html: string | null | undefined): string | null {
	if (!html) return null;
	const match = /<iframe\b[^>]*\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(html);
	const raw = (match?.[1] ?? match?.[2])?.replace(/&amp;/g, "&").trim();
	if (!raw) return null;
	try {
		const url = new URL(raw);
		if (url.protocol !== "https:") return null;
		return url.toString();
	} catch {
		return null;
	}
}
