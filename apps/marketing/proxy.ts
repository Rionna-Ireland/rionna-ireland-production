import { routing } from "@i18n/routing";
import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

const intlMiddleware = createMiddleware(routing);

export default async function proxy(req: NextRequest) {
	return intlMiddleware(req);
}

export const config = {
	matcher: [
		// `api/` is excluded so route handlers (e.g. the S12-09 one-click
		// unsubscribe POST) are not locale-rewritten into /[locale]/api/….
		"/((?!api/|images|fonts|_next/static|_next/image|favicon.ico|icon.png|sitemap.xml|robots.txt).*)",
	],
};
