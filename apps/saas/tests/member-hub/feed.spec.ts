/**
 * S2-17: member web Community feed happy path (no composer or commenting).
 *
 * Authed subscribed user lands on /{organizationSlug} → the "Feed" nav link
 * is visible → clicking it navigates to /{slug}/feed. If any feed card is
 * present, opening it navigates to a post page rendering an <article>. The
 * feed has no composer or comment controls (likes and poll votes are fine).
 *
 * Requires the standard seed (a subscribed user in a community). Skips if
 * `TEST_MEMBER_SLUG` is not provided, so the suite stays green in
 * environments without a seeded DB — mirroring dashboard.spec.ts (S2-08).
 */

import { expect, test } from "@playwright/test";

const slug = process.env.TEST_MEMBER_SLUG;

test.describe("member feed (S2-17)", () => {
	test.skip(!slug, "TEST_MEMBER_SLUG must be set to run this test against seeded data.");

	test("Feed nav opens the Community feed with no composer or comment controls", async ({
		page,
	}) => {
		await page.goto(`/${slug}`);

		// Feed nav link is visible; clicking it lands on the feed route.
		const feedNav = page.getByRole("link", { name: "Feed" });
		await expect(feedNav).toBeVisible();
		await feedNav.click();
		await expect(page).toHaveURL(/\/feed$/);

		// If the community has posts, open the first card and assert the post
		// page renders. Guarded so a zero-post community still passes.
		const firstCard = page.locator('a[href*="/feed/"]').first();
		if (await firstCard.isVisible().catch(() => false)) {
			await firstCard.click();
			await expect(page).toHaveURL(/\/feed\/.+\/.+/);
			await expect(page.locator("article").first()).toBeVisible();
		}

		// No posting or commenting on web (likes and poll votes are allowed).
		await page.goto(`/${slug}/feed`);
		await expect(page.getByRole("main").getByRole("textbox")).toHaveCount(0);
		await expect(page.getByRole("button", { name: /new post|comment|reply/i })).toHaveCount(0);
	});
});
