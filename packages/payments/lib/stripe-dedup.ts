import { db } from "@repo/database";

// A claim this old with no completedAt belongs to a killed function (W-08).
const STALE_CLAIM_MS = 5 * 60 * 1000;

/**
 * Returns true if the event is already processed or being processed.
 * Inserts the event ID atomically; on a unique-constraint hit, a stale
 * incomplete claim is re-taken so Stripe's retry can finish the work.
 */
export async function isEventDuplicate(eventId: string, eventType: string): Promise<boolean> {
	try {
		await db.stripeEventLog.create({
			data: { id: eventId, type: eventType },
		});
		return false; // First time seeing this event
	} catch (error: unknown) {
		if (
			error !== null &&
			error !== undefined &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "P2002"
		) {
			const now = Date.now();
			const { count } = await db.stripeEventLog.updateMany({
				where: {
					id: eventId,
					completedAt: null,
					processedAt: { lt: new Date(now - STALE_CLAIM_MS) },
				},
				data: { processedAt: new Date(now) },
			});
			return count === 0;
		}
		throw error; // Unexpected error — let it bubble
	}
}

export async function markEventCompleted(eventId: string): Promise<void> {
	await db.stripeEventLog.updateMany({
		where: { id: eventId },
		data: { completedAt: new Date() },
	});
}

export async function clearEventDedup(eventId: string): Promise<void> {
	await db.stripeEventLog.deleteMany({
		where: { id: eventId },
	});
}
