import { describe, expect, it } from "vitest";

import { splitUpcomingPast } from "./split-events";

const NOW = "2026-08-27T12:00:00.000Z";

describe("splitUpcomingPast", () => {
	it("splits on startsAt >= now", () => {
		const events = [
			{ id: "past-1", startsAt: "2026-08-26T12:00:00.000Z" },
			{ id: "future-1", startsAt: "2026-08-28T12:00:00.000Z" },
			{ id: "now", startsAt: NOW },
		];
		const { upcoming, past } = splitUpcomingPast(events, NOW);
		expect(upcoming.map((e) => e.id)).toEqual(["now", "future-1"]);
		expect(past.map((e) => e.id)).toEqual(["past-1"]);
	});

	it("treats a null startsAt as upcoming rather than hiding it", () => {
		const events = [
			{ id: "tbd", startsAt: null },
			{ id: "past-1", startsAt: "2026-08-01T00:00:00.000Z" },
		];
		const { upcoming, past } = splitUpcomingPast(events, NOW);
		expect(upcoming.map((e) => e.id)).toEqual(["tbd"]);
		expect(past.map((e) => e.id)).toEqual(["past-1"]);
	});

	it("sorts upcoming soonest-first and past most-recent-first", () => {
		const events = [
			{ id: "future-2", startsAt: "2026-09-05T00:00:00.000Z" },
			{ id: "future-1", startsAt: "2026-08-28T00:00:00.000Z" },
			{ id: "past-2", startsAt: "2026-08-20T00:00:00.000Z" },
			{ id: "past-1", startsAt: "2026-08-01T00:00:00.000Z" },
		];
		const { upcoming, past } = splitUpcomingPast(events, NOW);
		expect(upcoming.map((e) => e.id)).toEqual(["future-1", "future-2"]);
		expect(past.map((e) => e.id)).toEqual(["past-2", "past-1"]);
	});

	it("keeps null-startsAt events at the tail of their bucket when sorting", () => {
		const events = [
			{ id: "future-1", startsAt: "2026-08-28T00:00:00.000Z" },
			{ id: "tbd", startsAt: null },
		];
		const { upcoming } = splitUpcomingPast(events, NOW);
		expect(upcoming.map((e) => e.id)).toEqual(["future-1", "tbd"]);
	});
});
