/**
 * Horse-update composer logic (S2-09 slice 2b)
 *
 * Pure, framework-free logic the composer leans on: publish readiness gating,
 * and the fail-safe interpretation of the publish outcome (success vs a
 * "couldn't publish, try again" fallback — S12-06b B3 dropped the
 * "post directly in Circle" escape hatch, so this no longer resolves a URL).
 */

import { describe, expect, it } from "vitest";

import {
	canPublish,
	canPublishAnnouncement,
	isMemberUpdateType,
	resolvePublishOutcome,
} from "./composer-logic";

describe("composer-logic (S2-09)", () => {
	describe("isMemberUpdateType", () => {
		it("accepts the four update types and rejects anything else", () => {
			expect(isMemberUpdateType("trainer")).toBe(true);
			expect(isMemberUpdateType("wellbeing")).toBe(true);
			expect(isMemberUpdateType("general")).toBe(true);
			expect(isMemberUpdateType("race")).toBe(true);
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

	describe("resolvePublishOutcome", () => {
		it("maps an ok outcome to success", () => {
			expect(resolvePublishOutcome({ ok: true, circlePostId: "5001" })).toEqual({
				kind: "success",
			});
		});

		it("maps a failed outcome to a fallback, with no circleUrl property", () => {
			const resolution = resolvePublishOutcome({ ok: false, reason: "server_error" });
			expect(resolution).toEqual({ kind: "fallback" });
			expect(resolution).not.toHaveProperty("circleUrl");
		});

		it("still falls back when there's no reason on the outcome", () => {
			expect(resolvePublishOutcome({ ok: false })).toEqual({ kind: "fallback" });
		});
	});
});
