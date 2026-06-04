/**
 * S2-08 v1: member dashboard happy path.
 *
 * Authed subscribed user lands on /{organizationSlug} → MembershipHero
 * renders with their first name + an "Active" status pill → clicking
 * "Manage billing" redirects to a Stripe-hosted billing portal URL.
 *
 * Requires the standard seed (a subscribed user + a Stripe test customer
 * with an active subscription). Skips if `TEST_MEMBER_SLUG` /
 * `TEST_MEMBER_FIRST_NAME` env vars are not provided, so the suite stays
 * green in environments without a seeded DB.
 */

import { expect, test } from "@playwright/test";

const slug = process.env.TEST_MEMBER_SLUG;
const firstName = process.env.TEST_MEMBER_FIRST_NAME;

test.describe("member dashboard (S2-08 v1)", () => {
	test.skip(
		!slug || !firstName,
		"TEST_MEMBER_SLUG and TEST_MEMBER_FIRST_NAME must be set to run this test against seeded data.",
	);

	test("hero renders and Manage billing redirects to Stripe portal", async ({
		page,
	}) => {
		await page.goto(`/${slug}`);

		await expect(
			page.getByRole("heading", { name: "Your membership" }),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: `${firstName}.` })).toBeVisible();
		await expect(page.getByText(/Active/i)).toBeVisible();

		const manageBilling = page.getByRole("button", { name: /Manage billing/i });
		await expect(manageBilling).toBeVisible();

		// Capture the navigation regardless of whether it's same-tab or popup.
		const [navigation] = await Promise.all([
			page.waitForURL(/stripe\.com/, { timeout: 15_000 }).catch(() => null),
			manageBilling.click(),
		]);

		// Either the same page navigated to Stripe, or a popup opened to Stripe.
		const finalUrl = page.url();
		expect(finalUrl).toMatch(/stripe\.com/);
		void navigation; // referenced to keep the parallel ergonomics
	});
});
