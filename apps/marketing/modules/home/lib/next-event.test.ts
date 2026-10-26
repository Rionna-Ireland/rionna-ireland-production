import { describe, expect, it } from "vitest";

import { pickNextEvent } from "./next-event";

const now = new Date("2026-10-26T12:00:00Z");
const ev = (id: string, startsAt: string) => ({ id, startsAt });

describe("pickNextEvent", () => {
	it("returns null for no events", () => {
		expect(pickNextEvent([], now)).toBeNull();
	});
	it("returns null when all are past", () => {
		expect(pickNextEvent([ev("a", "2026-10-01T10:00:00Z")], now)).toBeNull();
	});
	it("picks the earliest future event regardless of order", () => {
		const picked = pickNextEvent(
			[
				ev("late", "2026-12-01T10:00:00Z"),
				ev("past", "2026-01-01T10:00:00Z"),
				ev("soon", "2026-11-01T10:00:00Z"),
			],
			now,
		);
		expect(picked?.id).toBe("soon");
	});
});
