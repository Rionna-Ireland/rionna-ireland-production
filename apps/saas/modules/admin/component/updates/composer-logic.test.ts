/**
 * Horse-update composer logic (S2-09 slice 2b)
 *
 * Pure, framework-free logic the composer leans on: publish readiness gating,
 * and the fail-safe interpretation of the publish outcome (success vs the
 * "post directly in Circle" fallback + the Circle URL to offer).
 */

import { describe, expect, it } from "vitest";

import {
	canPublish,
	canPublishAnnouncement,
	circleCommunityUrl,
	isMemberUpdateType,
	resolvePublishOutcome,
} from "./composer-logic";

describe("composer-logic (S2-09)", () => {
	describe("isMemberUpdateType", () => {
		it("accepts the three update types and rejects anything else", () => {
			expect(isMemberUpdateType("trainer")).toBe(true);
			expect(isMemberUpdateType("wellbeing")).toBe(true);
			expect(isMemberUpdateType("general")).toBe(true);
			expect(isMemberUpdateType("nonsense")).toBe(false);
		});
	});

	describe("canPublish", () => {
		it("requires a horse, a non-blank title, and a body", () => {
			expect(canPublish({ horseId: "h1", title: "Worked well", hasBody: true })).toBe(true);
		});

		it("is false when the horse is unselected", () => {
			expect(canPublish({ horseId: null, title: "x", hasBody: true })).toBe(false);
		});

		it("is false when the title is blank", () => {
			expect(canPublish({ horseId: "h1", title: "   ", hasBody: true })).toBe(false);
		});

		it("is false when there is no body", () => {
			expect(canPublish({ horseId: "h1", title: "x", hasBody: false })).toBe(false);
		});
	});

	describe("canPublishAnnouncement", () => {
		it("requires a non-blank title and a body (no horse)", () => {
			expect(canPublishAnnouncement({ title: "Welcome", hasBody: true })).toBe(true);
			expect(canPublishAnnouncement({ title: "  ", hasBody: true })).toBe(false);
			expect(canPublishAnnouncement({ title: "Welcome", hasBody: false })).toBe(false);
		});
	});

	describe("circleCommunityUrl", () => {
		it("builds an https URL from a bare domain", () => {
			expect(circleCommunityUrl("rionna.circle.so")).toBe("https://rionna.circle.so");
		});

		it("normalises an existing scheme and trailing slash", () => {
			expect(circleCommunityUrl("https://rionna.circle.so/")).toBe(
				"https://rionna.circle.so",
			);
		});

		it("returns null for a missing domain", () => {
			expect(circleCommunityUrl(null)).toBeNull();
			expect(circleCommunityUrl(undefined)).toBeNull();
			expect(circleCommunityUrl("")).toBeNull();
		});
	});

	describe("resolvePublishOutcome", () => {
		it("maps an ok outcome to success with no fallback url", () => {
			expect(
				resolvePublishOutcome(
					{ ok: true, circlePostId: "5001" },
					{ communityDomain: "rionna.circle.so" },
				),
			).toEqual({ kind: "success", circleUrl: null });
		});

		it("maps a failed outcome to a fallback carrying the Circle URL", () => {
			expect(
				resolvePublishOutcome(
					{ ok: false, reason: "server_error" },
					{ communityDomain: "rionna.circle.so" },
				),
			).toEqual({ kind: "fallback", circleUrl: "https://rionna.circle.so" });
		});

		it("still falls back (with a null url) when no community domain is known", () => {
			expect(
				resolvePublishOutcome(
					{ ok: false, reason: "no_circle_space" },
					{ communityDomain: null },
				),
			).toEqual({ kind: "fallback", circleUrl: null });
		});
	});
});
