/** Drives a 0 -> 1 progress loop; `raf` is injectable for tests. Returns a cancel function. */
export function runCount(opts: {
	durationMs: number;
	delayMs?: number;
	ease: (t: number) => number;
	raf: (cb: (now: number) => void) => number;
	cancelRaf: (id: number) => void;
	onFrame: (eased: number) => void;
	onDone: () => void;
}): () => void {
	const { durationMs, delayMs = 0, ease, raf, cancelRaf, onFrame, onDone } = opts;
	let id = 0;
	let start: number | null = null;
	const tick = (now: number) => {
		start ??= now + delayMs;
		const t = Math.min(Math.max((now - start) / durationMs, 0), 1);
		onFrame(ease(t));
		if (t < 1) id = raf(tick);
		else onDone();
	};
	id = raf(tick);
	return () => cancelRaf(id);
}
