/**
 * Run up to `limit` tasks in parallel. Resolves when every task has
 * settled. Tasks are scheduled by index — next-task-ready semantics, no
 * batch waterfalls.
 */
export async function runBounded<T>(
	limit: number,
	tasks: Array<() => Promise<T>>,
): Promise<void> {
	if (tasks.length === 0) return;
	const effectiveLimit = Math.max(1, Math.min(limit, tasks.length));
	let index = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const i = index++;
			if (i >= tasks.length) return;
			try {
				await tasks[i]();
			} catch {
				// Per-task errors are already swallowed upstream — this is a
				// belt-and-braces guard so a task throw doesn't kill the worker.
			}
		}
	};

	const workers: Array<Promise<void>> = [];
	for (let i = 0; i < effectiveLimit; i++) {
		workers.push(worker());
	}
	await Promise.all(workers);
}
