import { describe, expect, it } from "vitest";

import {
	isPollerTriggerAllowed,
	resolvePollPolicy,
	shouldWritePollHeartbeat,
} from "../poll-policy";

const NOW = new Date("2026-08-18T12:00:00.000Z");

describe("resolvePollPolicy", () => {
	it("preserves legacy behavior when S5-10 metadata is absent", () => {
		expect(resolvePollPolicy(undefined)).toEqual({
			deliveryProfile: "legacy_all",
			safetyMode: "observe",
			maxRequestsPerFiveMinutes: 700,
			heartbeatHours: 24,
			requestTimeoutMs: 8_000,
		});
	});

	it("falls back safely when runtime metadata contains unknown enum values", () => {
		const malformed = {
			deliveryProfile: "all_notifications",
			safetyMode: "enabled",
			maxRequestsPerFiveMinutes: 123,
			heartbeatHours: 12,
			requestTimeoutMs: 4_000,
		} as unknown as Parameters<typeof resolvePollPolicy>[0];

		expect(resolvePollPolicy(malformed)).toEqual({
			deliveryProfile: "legacy_all",
			safetyMode: "observe",
			maxRequestsPerFiveMinutes: 123,
			heartbeatHours: 12,
			requestTimeoutMs: 4_000,
		});
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
		"falls back safely when runtime numeric metadata is %s",
		(invalidValue) => {
			expect(
				resolvePollPolicy({
					maxRequestsPerFiveMinutes: invalidValue,
					heartbeatHours: invalidValue,
					requestTimeoutMs: invalidValue,
				}),
			).toEqual({
				deliveryProfile: "legacy_all",
				safetyMode: "observe",
				maxRequestsPerFiveMinutes: 700,
				heartbeatHours: 24,
				requestTimeoutMs: 8_000,
			});
		},
	);

	it("preserves valid operational metadata", () => {
		expect(
			resolvePollPolicy({
				deliveryProfile: "personalized_only",
				safetyMode: "enforce",
				maxRequestsPerFiveMinutes: 350,
				heartbeatHours: 12,
				requestTimeoutMs: 4_000,
			}),
		).toEqual({
			deliveryProfile: "personalized_only",
			safetyMode: "enforce",
			maxRequestsPerFiveMinutes: 350,
			heartbeatHours: 12,
			requestTimeoutMs: 4_000,
		});
	});
});

describe("shouldWritePollHeartbeat", () => {
	it("is false just before 24 hours and true at the 24-hour boundary", () => {
		expect(
			shouldWritePollHeartbeat(new Date(NOW.getTime() - (24 * 60 * 60 * 1_000 - 1)), NOW, 24),
		).toBe(false);
		expect(
			shouldWritePollHeartbeat(new Date(NOW.getTime() - 24 * 60 * 60 * 1_000), NOW, 24),
		).toBe(true);
	});

	it("requires a heartbeat when no previous successful poll exists", () => {
		expect(shouldWritePollHeartbeat(null, NOW, 24)).toBe(true);
	});
});

describe("isPollerTriggerAllowed", () => {
	it("legacy_all admits every trigger emitted by the Circle mapper", () => {
		const triggers = [
			"CIRCLE_MENTION",
			"CIRCLE_REPLY",
			"CIRCLE_REACTION",
			"CIRCLE_DM",
			"CIRCLE_HORSE_DISCUSSION",
			"TRAINER_POST",
		] as const;

		expect(triggers.every((trigger) => isPollerTriggerAllowed("legacy_all", trigger))).toBe(
			true,
		);
	});

	it("personalized_only admits mention/reply/DM and rejects broad activity", () => {
		expect(isPollerTriggerAllowed("personalized_only", "CIRCLE_MENTION")).toBe(true);
		expect(isPollerTriggerAllowed("personalized_only", "CIRCLE_REPLY")).toBe(true);
		expect(isPollerTriggerAllowed("personalized_only", "CIRCLE_DM")).toBe(true);
		expect(isPollerTriggerAllowed("personalized_only", "CIRCLE_REACTION")).toBe(false);
		expect(isPollerTriggerAllowed("personalized_only", "TRAINER_POST")).toBe(false);
		expect(isPollerTriggerAllowed("personalized_only", "CIRCLE_HORSE_DISCUSSION")).toBe(false);
	});
});
