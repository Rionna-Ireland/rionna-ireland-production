/** Earliest event starting at or after `now`; events without a start date are ignored. */
export function pickNextEvent<T extends { startsAt: string | Date | null }>(
	events: T[],
	now: Date,
): T | null {
	let best: T | null = null;
	let bestTime = Infinity;
	for (const event of events) {
		if (!event.startsAt) continue;
		const time = new Date(event.startsAt).getTime();
		if (time >= now.getTime() && time < bestTime) {
			best = event;
			bestTime = time;
		}
	}
	return best;
}
