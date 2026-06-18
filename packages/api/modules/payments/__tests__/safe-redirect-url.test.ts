/**
 * Security regression tests for the checkout/portal redirect-URL guard.
 *
 * Stripe bounces the authenticated user to whatever success_url / return_url we
 * pass, so a cross-origin value is an open-redirect / phishing vector. These
 * tests lock in the same-origin contract.
 */

import { ORPCError } from "@orpc/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveSafeRedirectUrl } from "../lib/safe-redirect-url";

const APP_ORIGIN = "https://app.rionna.example";

describe("resolveSafeRedirectUrl", () => {
	let prevSaasUrl: string | undefined;

	beforeAll(() => {
		prevSaasUrl = process.env.NEXT_PUBLIC_SAAS_URL;
		process.env.NEXT_PUBLIC_SAAS_URL = APP_ORIGIN;
	});

	afterAll(() => {
		process.env.NEXT_PUBLIC_SAAS_URL = prevSaasUrl;
	});

	it("returns undefined when no redirect URL is supplied", () => {
		expect(resolveSafeRedirectUrl(undefined)).toBeUndefined();
		expect(resolveSafeRedirectUrl("")).toBeUndefined();
	});

	it("allows an absolute same-origin URL", () => {
		expect(
			resolveSafeRedirectUrl(`${APP_ORIGIN}/checkout-return?organizationId=org_1`),
		).toBe(`${APP_ORIGIN}/checkout-return?organizationId=org_1`);
	});

	it("resolves a relative path against the app origin", () => {
		expect(resolveSafeRedirectUrl("/checkout-return")).toBe(
			`${APP_ORIGIN}/checkout-return`,
		);
	});

	it("rejects a cross-origin redirect (open-redirect / phishing vector)", () => {
		expect(() => resolveSafeRedirectUrl("https://evil.example/steal")).toThrow(
			ORPCError,
		);
	});

	it("rejects a protocol-relative URL pointing off-origin", () => {
		// new URL("//evil.example", appOrigin) inherits the https scheme but lands
		// on evil.example — must be blocked.
		expect(() => resolveSafeRedirectUrl("//evil.example/steal")).toThrow(
			ORPCError,
		);
	});

	it("rejects a malformed URL", () => {
		expect(() => resolveSafeRedirectUrl("http://[::bad")).toThrow(ORPCError);
	});
});
