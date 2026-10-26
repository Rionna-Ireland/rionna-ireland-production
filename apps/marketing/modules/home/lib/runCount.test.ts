import { describe, expect, it } from "vitest";

import { parseStatValue } from "./parseStatValue";
import { runCount } from "./runCount";

describe("runCount", () => {
	it("ends exactly on the parsed number and reports done", () => {
		const parsed = parseStatValue("€48k");
		if (!parsed) throw new Error("parse");
		let queue: ((n: number) => void)[] = [];
		const values: number[] = [];
		let done = false;
		runCount({
			durationMs: 1000,
			delayMs: 100,
			ease: (t) => t,
			raf: (cb) => queue.push(cb),
			cancelRaf: () => {},
			onFrame: (e) => values.push(parsed.number * e),
			onDone: () => {
				done = true;
			},
		});
		for (let now = 0; now <= 1500 && !done; now += 100) {
			const q = queue;
			queue = [];
			for (const cb of q) cb(now);
		}
		expect(done).toBe(true);
		expect(values[0]).toBe(0);
		expect(values.at(-1)).toBe(48);
	});

	it("stops when cancelled", () => {
		let cancelled = 0;
		const cancel = runCount({
			durationMs: 10,
			ease: (t) => t,
			raf: () => 7,
			cancelRaf: (id) => {
				cancelled = id;
			},
			onFrame: () => {},
			onDone: () => {},
		});
		cancel();
		expect(cancelled).toBe(7);
	});
});
