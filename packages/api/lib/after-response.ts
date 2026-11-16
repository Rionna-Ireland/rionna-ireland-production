type AfterResponse = (task: Promise<unknown>) => void;

let afterResponse: AfterResponse | undefined;

/**
 * The Next route handler registers `after` from `next/server`. packages/api
 * cannot import it itself: pnpm would give it a second Next copy whose
 * request scope is never set, so `after` would always throw.
 */
export function setAfterResponse(fn: AfterResponse): void {
	afterResponse = fn;
}

/**
 * Keep already-started background work (notifications, emails) alive after
 * the response is sent. Without this Vercel can freeze the function first.
 */
export function runAfterResponse(task: Promise<unknown>): void {
	try {
		afterResponse?.(task);
	} catch {
		// Outside a request scope (tests, scripts): the task still runs on its own.
	}
}
