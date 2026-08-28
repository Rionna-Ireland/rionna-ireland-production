/**
 * Admin events list (S11-02 Task 6) — pure, framework-free split of the
 * Circle events list into "upcoming" (sorted soonest-first) and "past"
 * (sorted most-recent-first) buckets. An event with no `startsAt` (Circle
 * allows a TBD date) is treated as upcoming rather than hidden in the past
 * bucket, since it's presumably still being scheduled.
 */

interface EventLike {
	startsAt: string | null;
}

export function splitUpcomingPast<T extends EventLike>(
	events: T[],
	nowIso: string,
): { upcoming: T[]; past: T[] } {
	const upcoming: T[] = [];
	const past: T[] = [];

	for (const event of events) {
		if (event.startsAt !== null && event.startsAt < nowIso) {
			past.push(event);
		} else {
			upcoming.push(event);
		}
	}

	upcoming.sort((a, b) => {
		if (a.startsAt === null) return 1;
		if (b.startsAt === null) return -1;
		return a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : 0;
	});
	past.sort((a, b) => {
		if (a.startsAt === null) return 1;
		if (b.startsAt === null) return -1;
		return a.startsAt > b.startsAt ? -1 : a.startsAt < b.startsAt ? 1 : 0;
	});

	return { upcoming, past };
}
