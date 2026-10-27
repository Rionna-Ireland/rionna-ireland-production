import { routing } from "@i18n/routing";
import { hasPreviewAccess, PREVIEW_COOKIE } from "@shared/lib/preview-access";
import {
	isAllowedInWaitlistMode,
	isStaticMediaPath,
	isWaitlistOnly,
} from "@shared/lib/waitlist-mode";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default async function proxy(req: NextRequest) {
	// S12-09 / D39: one-page site until launch. Temporary (307) so nothing
	// caches the redirect past the NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN flip.
	// The client preview cookie unlocks the full site (see preview-access.ts).
	if (
		isWaitlistOnly() &&
		!isAllowedInWaitlistMode(req.nextUrl.pathname, routing.locales) &&
		!(await hasPreviewAccess(req.cookies.get(PREVIEW_COOKIE)?.value))
	) {
		return NextResponse.redirect(new URL("/", req.url), 307);
	}

	// Static media passes the gate above but skips the locale rewrite.
	if (isStaticMediaPath(req.nextUrl.pathname)) return NextResponse.next();

	return intlMiddleware(req);
}

export const config = {
	matcher: [
		// `api/` is excluded so route handlers (e.g. the S12-09 one-click
		// unsubscribe POST) are not locale-rewritten into /[locale]/api/….
		"/((?!api/|images|fonts|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|sitemap.xml|robots.txt).*)",
	],
};
