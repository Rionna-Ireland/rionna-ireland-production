import { db } from "@repo/database";
import { logger } from "@repo/logs";

import { EVENT_TYPE_LABELS, type EventTypeValue, isEventType } from "./event-types";

export interface EventTypeFields {
	/** Display label, e.g. "Race Day" (mobile renders this directly). */
	type: string;
	/** Raw enum value. */
	eventType: EventTypeValue;
}

export function typeFields(eventType: EventTypeValue): EventTypeFields {
	return { type: EVENT_TYPE_LABELS[eventType], eventType };
}

/**
 * Batched type lookup for a page of Circle events. Missing rows — and any
 * lookup failure — resolve to OTHER: the event surfaces must never fail
 * because the sidecar is unavailable.
 */
export async function getEventTypes(
	organizationId: string,
	circleEventIds: string[],
): Promise<Map<string, EventTypeValue>> {
	const result = new Map<string, EventTypeValue>();
	if (circleEventIds.length === 0) return result;
	try {
		const rows = await db.clubEventMeta.findMany({
			where: { organizationId, circleEventId: { in: circleEventIds } },
			select: { circleEventId: true, type: true },
		});
		for (const row of rows) {
			if (isEventType(row.type)) result.set(row.circleEventId, row.type);
		}
	} catch (error) {
		logger.warn("[Events] type lookup failed; defaulting to OTHER", {
			organizationId,
			error: String(error),
		});
	}
	return result;
}

export async function withEventTypes<T extends { id: string }>(
	organizationId: string,
	events: T[],
): Promise<Array<T & EventTypeFields>> {
	const types = await getEventTypes(
		organizationId,
		events.map((e) => e.id),
	);
	return events.map((e) => ({ ...e, ...typeFields(types.get(e.id) ?? "OTHER") }));
}

export async function setEventType(
	organizationId: string,
	circleEventId: string,
	type: EventTypeValue,
): Promise<void> {
	await db.clubEventMeta.upsert({
		where: { circleEventId },
		create: { organizationId, circleEventId, type },
		update: { type },
	});
}
