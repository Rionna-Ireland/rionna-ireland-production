import { describe, expect, it } from "vitest";

import { shouldHydrateOnce } from "./use-hydrate-once";

describe("shouldHydrateOnce", () => {
	it("hydrates a pristine form for a record it has not loaded", () => {
		expect(shouldHydrateOnce(null, "poll-1", false)).toBe(true);
	});

	it("does not hydrate the same record twice", () => {
		expect(shouldHydrateOnce("poll-1", "poll-1", false)).toBe(false);
	});

	it("does not overwrite dirty form edits when the record changes", () => {
		expect(shouldHydrateOnce("poll-1", "poll-2", true)).toBe(false);
	});

	it("hydrates a different record when the form is pristine", () => {
		expect(shouldHydrateOnce("poll-1", "poll-2", false)).toBe(true);
	});
});
