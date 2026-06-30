/**
 * S5-07 (item 3): Cron request authorization.
 *
 * The Vercel cron routes must **fail closed** when `CRON_SECRET` is unset
 * (otherwise the expected header collapses to the literal "Bearer undefined"
 * and the expensive jobs become publicly triggerable). Comparison must be
 * constant-time and must not leak — or throw on — token length.
 *
 * Cases:
 *   secret unset / empty   -> false
 *   missing Authorization  -> false
 *   wrong token            -> false
 *   different-length token -> false (no throw)
 *   correct Bearer <secret> -> true
 *
 * @see Architecture/specs/S5-07-*.md
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isAuthorizedCronRequest } from "../cron-auth";

const SECRET = "s3cr3t-cron-token";
const originalSecret = process.env.CRON_SECRET;

function requestWith(authHeader?: string): Request {
	const headers = new Headers();
	if (authHeader !== undefined) {
		headers.set("authorization", authHeader);
	}
	return new Request("https://example.com/api/cron/ingest", {
		method: "POST",
		headers,
	});
}

beforeEach(() => {
	process.env.CRON_SECRET = SECRET;
});

afterEach(() => {
	if (originalSecret === undefined) {
		delete process.env.CRON_SECRET;
	} else {
		process.env.CRON_SECRET = originalSecret;
	}
});

describe("isAuthorizedCronRequest", () => {
	it("fails closed when CRON_SECRET is unset", () => {
		delete process.env.CRON_SECRET;
		expect(isAuthorizedCronRequest(requestWith(`Bearer ${SECRET}`))).toBe(false);
	});

	it("fails closed when CRON_SECRET is empty", () => {
		process.env.CRON_SECRET = "";
		expect(isAuthorizedCronRequest(requestWith("Bearer "))).toBe(false);
	});

	it("rejects a missing Authorization header", () => {
		expect(isAuthorizedCronRequest(requestWith())).toBe(false);
	});

	it("rejects an empty Authorization header", () => {
		expect(isAuthorizedCronRequest(requestWith(""))).toBe(false);
	});

	it("rejects a wrong token of the same length", () => {
		const wrong = "x".repeat(SECRET.length);
		expect(isAuthorizedCronRequest(requestWith(`Bearer ${wrong}`))).toBe(false);
	});

	it("rejects a token of a different length without throwing", () => {
		expect(() =>
			isAuthorizedCronRequest(requestWith("Bearer short")),
		).not.toThrow();
		expect(isAuthorizedCronRequest(requestWith("Bearer short"))).toBe(false);
	});

	it("accepts the correct Bearer <secret>", () => {
		expect(isAuthorizedCronRequest(requestWith(`Bearer ${SECRET}`))).toBe(true);
	});
});
