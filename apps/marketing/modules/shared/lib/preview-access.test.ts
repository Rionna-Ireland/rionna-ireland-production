import { describe, expect, it } from "vitest";

import { hasPreviewAccess, previewToken } from "./preview-access";

describe("hasPreviewAccess", () => {
	it("accepts the token for the current password only", async () => {
		const token = await previewToken("hunter2");
		expect(await hasPreviewAccess(token, "hunter2")).toBe(true);
		expect(await hasPreviewAccess(token, "rotated")).toBe(false);
		expect(await hasPreviewAccess("hunter2", "hunter2")).toBe(false);
	});

	it("is off without a password or cookie", async () => {
		expect(await hasPreviewAccess(await previewToken(""), undefined)).toBe(false);
		expect(await hasPreviewAccess(undefined, "hunter2")).toBe(false);
	});
});
