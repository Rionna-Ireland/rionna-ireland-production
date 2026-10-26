import { PREVIEW_COOKIE, PREVIEW_MAX_AGE, previewToken } from "@shared/lib/preview-access";
import { type NextRequest, NextResponse } from "next/server";

// shortcut: no rate limit on guesses, fine for a long shared password; add one if the preview outlives launch prep.
export async function POST(req: NextRequest) {
	const password = process.env.MARKETING_PREVIEW_PASSWORD;
	const given = (await req.formData()).get("password");
	const token = password ? await previewToken(password) : undefined;

	if (!token || typeof given !== "string" || (await previewToken(given)) !== token) {
		return NextResponse.redirect(new URL("/preview?error=1", req.url), 303);
	}

	const res = NextResponse.redirect(new URL("/", req.url), 303);
	res.cookies.set(PREVIEW_COOKIE, token, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge: PREVIEW_MAX_AGE,
	});
	return res;
}
