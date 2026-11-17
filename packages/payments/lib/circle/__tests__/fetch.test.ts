import { afterEach, describe, expect, it, vi } from "vitest";

import { CIRCLE_FETCH_TIMEOUT_MS, circleFetch } from "../fetch";

/** A fetch that never answers, but rejects like undici when its signal aborts. */
function hangingFetch() {
	return vi.fn(
		(_url: string, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
			}),
	);
}

describe("circleFetch", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("aborts a hanging Circle request after the timeout", async () => {
		vi.useFakeTimers();
		// Node's AbortSignal.timeout runs on internal timers fake timers can't reach.
		vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
			const controller = new AbortController();
			setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), ms);
			return controller.signal;
		});
		vi.stubGlobal("fetch", hangingFetch());

		const pending = circleFetch("https://app.circle.so/api/x");
		const settled = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
		await vi.advanceTimersByTimeAsync(CIRCLE_FETCH_TIMEOUT_MS);
		await settled;
	});

	it("keeps a caller-supplied signal instead of the default timeout", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
		vi.stubGlobal("fetch", fetchMock);
		const controller = new AbortController();

		await circleFetch("https://app.circle.so/api/x", {
			method: "POST",
			signal: controller.signal,
		});

		expect(fetchMock).toHaveBeenCalledWith("https://app.circle.so/api/x", {
			method: "POST",
			signal: controller.signal,
		});
	});
});
