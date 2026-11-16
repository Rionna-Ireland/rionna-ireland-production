export const CIRCLE_FETCH_TIMEOUT_MS = 8_000;

/** `fetch` for Circle calls: a slow Circle must not hold the request until maxDuration. */
export function circleFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
	return fetch(url, {
		...init,
		signal: init.signal ?? AbortSignal.timeout(CIRCLE_FETCH_TIMEOUT_MS),
	});
}
