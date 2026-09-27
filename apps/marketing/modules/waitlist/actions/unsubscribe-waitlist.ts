"use server";

import { logger } from "@repo/logs";

import { unsubscribeWaitlistToken } from "../lib/unsubscribe";

export interface UnsubscribeWaitlistState {
	status: "idle" | "done" | "error";
}

/**
 * S12-09 unsubscribe confirm button (`/waitlist/unsubscribe?token=…`).
 * `useActionState`-shaped. Every token, known or not, ends in the same
 * "done" state; only a database failure reports an error.
 */
export async function unsubscribeFromWaitlist(
	_previous: UnsubscribeWaitlistState,
	formData: FormData,
): Promise<UnsubscribeWaitlistState> {
	try {
		await unsubscribeWaitlistToken(formData.get("token"));
		return { status: "done" };
	} catch (error) {
		logger.error(error, { ctx: "unsubscribeFromWaitlist" });
		return { status: "error" };
	}
}
