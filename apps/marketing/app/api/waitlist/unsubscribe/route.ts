import { logger } from "@repo/logs";
import { unsubscribeWaitlistToken } from "@waitlist/lib/unsubscribe";

/**
 * S12-09 one-click unsubscribe (RFC 8058). The launch email carries
 * `List-Unsubscribe: <…/api/waitlist/unsubscribe?token=…>` and
 * `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; mail clients POST here.
 *
 * Idempotent and non-enumerating: known, unknown and already-unsubscribed
 * tokens all get 200. Only a database failure returns 500, so the client can
 * retry rather than silently leaving the address subscribed.
 */
export async function POST(request: Request): Promise<Response> {
	const token = new URL(request.url).searchParams.get("token");

	try {
		await unsubscribeWaitlistToken(token);
	} catch (error) {
		logger.error(error, { ctx: "waitlistOneClickUnsubscribe" });
		return new Response(null, { status: 500 });
	}

	return new Response(null, { status: 200 });
}

/**
 * A plain GET (someone opening the header URL in a browser, or a link
 * scanner) must never unsubscribe. Send it to the confirm page instead.
 */
export function GET(request: Request): Response {
	const url = new URL(request.url);
	const target = new URL("/waitlist/unsubscribe", url.origin);
	const token = url.searchParams.get("token");
	if (token) {
		target.searchParams.set("token", token);
	}
	return Response.redirect(target, 303);
}
