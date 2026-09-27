import { db } from "@repo/database";
import { isPublicSignupOpen } from "@repo/utils";
import { APIError } from "better-auth/api";

export const SIGNUP_CLOSED_ERROR_CODE = "SIGNUP_CLOSED";

/**
 * S12-09 / D39: server-side sign-up guard. While public signup is closed
 * (`NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN !== "true"`), `/sign-up/email` only accepts
 * an email that holds a pending, unexpired organization `Invitation` — the
 * same check `/signup` does before rendering the form. Admin invites keep
 * working; a direct POST from anyone else is refused.
 *
 * Single club (D37): any pending invitation counts, there is only one org.
 */
export async function hasPendingInvitation(email: string): Promise<boolean> {
	const invitation = await db.invitation.findFirst({
		where: {
			email: { equals: email.trim(), mode: "insensitive" },
			status: "pending",
			expiresAt: { gt: new Date() },
		},
		select: { id: true },
	});

	return invitation !== null;
}

/** Throws a FORBIDDEN `APIError` when the sign-up must be refused. */
export async function assertSignupAllowed(body: unknown): Promise<void> {
	if (isPublicSignupOpen()) {
		return;
	}

	const email =
		body && typeof body === "object" && "email" in body && typeof body.email === "string"
			? body.email
			: "";

	if (email && (await hasPendingInvitation(email))) {
		return;
	}

	throw new APIError("FORBIDDEN", {
		code: SIGNUP_CLOSED_ERROR_CODE,
		message: "Sign-up is currently by invitation only. Join the waitlist to hear when we open.",
	});
}
