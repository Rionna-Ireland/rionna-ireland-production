"use server";

import { createHash, randomBytes } from "node:crypto";

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { WAITLIST_CONSENT_VERSION } from "@repo/utils";
import { checkRateLimit, getClientIp } from "@repo/utils/lib/rate-limit";
import { getClubOrganization } from "@shared/lib/club";
import { headers } from "next/headers";
import { z } from "zod";

import {
	createWaitlistFieldsSchema,
	isHoneypotFilled,
	isWaitlistErrorCode,
	sanitizeSource,
	WAITLIST_HONEYPOT_FIELD,
	type WaitlistErrorCode,
	type WaitlistField,
} from "../lib/schema";

/**
 * S12-09 waitlist signup (single opt-in, no email sent).
 *
 * Every valid submission gets the same `{ ok: true }` whether the address is
 * new, already subscribed or previously unsubscribed, so the form can't be
 * used to find out who is on the list. A filled honeypot gets the same fake
 * success and writes nothing.
 */
export type JoinWaitlistResult =
	| { ok: true }
	| {
			ok: false;
			error: "validation";
			fieldErrors: Partial<Record<WaitlistField, WaitlistErrorCode>>;
	  }
	| { ok: false; error: "rate_limited" | "unavailable" };

type SignupOutcome = "created" | "updated" | "resubscribed";

const IP_LIMIT = { prefix: "rl:waitlist:ip", limit: 5, windowSeconds: 10 * 60 };
const EMAIL_LIMIT = { prefix: "rl:waitlist:email", limit: 3, windowSeconds: 60 * 60 };

const fieldsSchema = createWaitlistFieldsSchema();

export async function joinWaitlist(input: unknown): Promise<JoinWaitlistResult> {
	const raw: Record<string, unknown> =
		typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

	if (isHoneypotFilled(raw[WAITLIST_HONEYPOT_FIELD])) {
		logger.info("[Waitlist] honeypot filled; ignoring", { event: "waitlist_honeypot" });
		return { ok: true };
	}

	const ip = getClientIp(await headers());
	const ipVerdict = await checkRateLimit({ ...IP_LIMIT, key: ip });
	if (!ipVerdict.ok) {
		logger.warn("[Waitlist] rate limited", { event: "waitlist_rate_limited", scope: "ip" });
		return { ok: false, error: "rate_limited" };
	}

	const parsed = fieldsSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, error: "validation", fieldErrors: toFieldErrors(parsed.error) };
	}

	const { firstName, lastName, email } = parsed.data;
	const source = sanitizeSource(raw.source);

	// Hash the address so raw emails never sit in Redis keys.
	const emailVerdict = await checkRateLimit({ ...EMAIL_LIMIT, key: hashEmail(email) });
	if (!emailVerdict.ok) {
		logger.warn("[Waitlist] rate limited", { event: "waitlist_rate_limited", scope: "email" });
		return { ok: false, error: "rate_limited" };
	}

	try {
		const org = await getClubOrganization();
		if (!org.id) {
			logger.error("[Waitlist] club organization not found", { event: "waitlist_no_org" });
			return { ok: false, error: "unavailable" };
		}

		const signup = { organizationId: org.id, email, firstName, lastName, source };
		let outcome: SignupOutcome;
		try {
			outcome = await saveSignup(signup);
		} catch (error) {
			// Two concurrent first-time submissions: the loser hits the
			// (organizationId, email) unique index. The row exists now, so retry
			// once and take the update path.
			if (!isUniqueViolation(error)) {
				throw error;
			}
			outcome = await saveSignup(signup);
		}

		logger.info("[Waitlist] signup", { event: "waitlist_signup", outcome, source });
		return { ok: true };
	} catch (error) {
		logger.error(error, { ctx: "joinWaitlist" });
		return { ok: false, error: "unavailable" };
	}
}

async function saveSignup(signup: {
	organizationId: string;
	email: string;
	firstName: string;
	lastName: string;
	source: string | null;
}): Promise<SignupOutcome> {
	const { organizationId, email, firstName, lastName, source } = signup;

	const existing = await db.waitlistSignup.findUnique({
		where: { organizationId_email: { organizationId, email } },
		select: { id: true, status: true },
	});

	if (!existing) {
		await db.waitlistSignup.create({
			data: {
				organizationId,
				email,
				firstName,
				lastName,
				source,
				status: "subscribed",
				consentVersion: WAITLIST_CONSENT_VERSION,
				consentedAt: new Date(),
				unsubscribeToken: generateUnsubscribeToken(),
			},
		});
		return "created";
	}

	// Keep an earlier attribution when this visit carries no ?src= tag.
	const sourceUpdate = source ? { source } : {};

	if (existing.status === "unsubscribed") {
		// They ticked the box again: fresh consent record.
		await db.waitlistSignup.update({
			where: { id: existing.id },
			data: {
				firstName,
				lastName,
				...sourceUpdate,
				status: "subscribed",
				consentVersion: WAITLIST_CONSENT_VERSION,
				consentedAt: new Date(),
				unsubscribedAt: null,
			},
		});
		return "resubscribed";
	}

	// Already subscribed: refresh names/source, keep the original consentedAt.
	await db.waitlistSignup.update({
		where: { id: existing.id },
		data: { firstName, lastName, ...sourceUpdate },
	});
	return "updated";
}

function toFieldErrors(error: z.ZodError): Partial<Record<WaitlistField, WaitlistErrorCode>> {
	const fieldErrors: Partial<Record<WaitlistField, WaitlistErrorCode>> = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		if (
			(field === "firstName" ||
				field === "lastName" ||
				field === "email" ||
				field === "consent") &&
			!fieldErrors[field]
		) {
			fieldErrors[field] = isWaitlistErrorCode(issue.message)
				? issue.message
				: fallbackCode(field);
		}
	}
	return fieldErrors;
}

function fallbackCode(field: WaitlistField): WaitlistErrorCode {
	switch (field) {
		case "firstName":
			return "firstNameRequired";
		case "lastName":
			return "lastNameRequired";
		case "email":
			return "emailInvalid";
		case "consent":
			return "consentRequired";
	}
}

function generateUnsubscribeToken(): string {
	return randomBytes(32).toString("base64url");
}

function hashEmail(email: string): string {
	return createHash("sha256").update(email).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: unknown }).code === "P2002"
	);
}
