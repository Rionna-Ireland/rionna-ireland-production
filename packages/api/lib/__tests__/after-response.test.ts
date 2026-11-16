import { describe, expect, it, vi } from "vitest";

import { runAfterResponse, setAfterResponse } from "../after-response";

describe("runAfterResponse", () => {
	it("hands the task to the registered after-response hook", () => {
		const after = vi.fn();
		setAfterResponse(after);
		const task = Promise.resolve();

		runAfterResponse(task);

		expect(after).toHaveBeenCalledWith(task);
	});

	it("does not throw outside a request scope (tests, scripts)", () => {
		setAfterResponse(() => {
			throw new Error("`after` was called outside a request scope");
		});
		expect(() => runAfterResponse(Promise.resolve())).not.toThrow();
	});
});
