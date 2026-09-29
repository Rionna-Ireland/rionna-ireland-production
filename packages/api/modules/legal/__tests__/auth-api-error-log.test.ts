/**
 * Better Auth `onAPIError.onError` logging (packages/auth/lib/api-error-log.ts).
 * Lives here because @repo/auth has no test runner; @repo/api depends on it.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	db: { invitation: { findFirst: vi.fn(async () => null) } },
}));

import { apiErrorLogFields } from "@repo/auth/lib/api-error-log";
import { assertSignupAllowed, SIGNUP_CLOSED_ERROR_CODE } from "@repo/auth/lib/signup-guard";

/** A real Better Auth APIError (FORBIDDEN, with a code) from the signup guard. */
async function realApiError(): Promise<unknown> {
	delete process.env.NEXT_PUBLIC_PUBLIC_SIGNUP_OPEN;
	return assertSignupAllowed(undefined).catch((error: unknown) => error);
}

describe("apiErrorLogFields", () => {
	it("keeps only name, message, status and code from an APIError", async () => {
		const fields = apiErrorLogFields(await realApiError());

		expect(fields).toEqual({
			name: "APIError",
			message: expect.stringContaining("invitation only"),
			status: "FORBIDDEN",
			statusCode: 403,
			code: SIGNUP_CLOSED_ERROR_CODE,
		});
	});

	it("reduces other errors to name and message", () => {
		expect(apiErrorLogFields(new TypeError("boom"))).toEqual({
			name: "TypeError",
			message: "boom",
		});
		expect(apiErrorLogFields("weird")).toEqual({ message: "weird" });
	});

	it("never includes anything but the whitelisted keys", () => {
		const error = Object.assign(new Error("x"), { secret: "s3cr3t", options: { secret: "s" } });

		expect(JSON.stringify(apiErrorLogFields(error))).not.toContain("s3cr3t");
		expect(Object.keys(apiErrorLogFields(error)).sort()).toEqual(["message", "name"]);
	});
});
