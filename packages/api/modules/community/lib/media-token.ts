/**
 * Signed proof that a member registered a Circle direct-upload blob through us
 * (S15-01). `createPost` verifies it, so no DB table is needed. HMAC-SHA256
 * over the compact JSON payload, keyed with BETTER_AUTH_SECRET.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { MEDIA_TOKEN_TTL_MS } from "./limits";

export interface MediaTokenPayload {
	signedId: string;
	attachableSgid?: string;
	cdnUrl: string;
	contentType: string;
	kind: "image" | "video";
	memberId: string;
	orgId: string;
	/** Expiry, unix ms. */
	exp: number;
}

function sign(data: string): Buffer {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
	return createHmac("sha256", secret).update(data).digest();
}

export function signMediaToken(
	payload: Omit<MediaTokenPayload, "exp">,
	now = Date.now(),
): string {
	const body = Buffer.from(JSON.stringify({ ...payload, exp: now + MEDIA_TOKEN_TTL_MS })).toString("base64url");
	return `${body}.${sign(body).toString("base64url")}`;
}

/** Returns the payload only if the signature, expiry, member and org all check out. */
export function verifyMediaToken(
	token: string,
	expect: { memberId: string; orgId: string },
	now = Date.now(),
): MediaTokenPayload | null {
	const [body, sig, extra] = token.split(".");
	if (!body || !sig || extra !== undefined) return null;
	const given = Buffer.from(sig, "base64url");
	const want = sign(body);
	if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
	try {
		const p = JSON.parse(Buffer.from(body, "base64url").toString()) as MediaTokenPayload;
		if (p.exp <= now || p.memberId !== expect.memberId || p.orgId !== expect.orgId) return null;
		return p;
	} catch {
		return null;
	}
}
