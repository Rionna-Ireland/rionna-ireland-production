import type {
	CirclePollDeliveryProfile,
	CirclePollSafetyMode,
} from "@repo/database";

export type {
	CirclePollDeliveryProfile,
	CirclePollSafetyMode,
} from "@repo/database";

export interface CirclePollPolicyInput {
	deliveryProfile?: CirclePollDeliveryProfile;
	safetyMode?: CirclePollSafetyMode;
	maxRequestsPerFiveMinutes?: number;
	heartbeatHours?: number;
	requestTimeoutMs?: number;
}

export interface ResolvedCirclePollPolicy {
	deliveryProfile: CirclePollDeliveryProfile;
	safetyMode: CirclePollSafetyMode;
	maxRequestsPerFiveMinutes: number;
	heartbeatHours: number;
	requestTimeoutMs: number;
}

export type PollerTrigger =
	| "CIRCLE_MENTION"
	| "CIRCLE_REPLY"
	| "CIRCLE_REACTION"
	| "CIRCLE_DM"
	| "CIRCLE_HORSE_DISCUSSION"
	| "TRAINER_POST";

export function isPollerTriggerAllowed(
	profile: CirclePollDeliveryProfile,
	trigger: PollerTrigger,
): boolean {
	return (
		profile === "legacy_all" ||
		trigger === "CIRCLE_MENTION" ||
		trigger === "CIRCLE_REPLY" ||
		trigger === "CIRCLE_DM"
	);
}

export function shouldWritePollHeartbeat(
	lastPolledAt: Date | null,
	now: Date,
	heartbeatHours: number,
): boolean {
	if (lastPolledAt === null) return true;
	return now.getTime() - lastPolledAt.getTime() >= heartbeatHours * 60 * 60 * 1_000;
}

function positiveFiniteOr(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolvePollPolicy(
	config: CirclePollPolicyInput | undefined,
): ResolvedCirclePollPolicy {
	return {
		deliveryProfile:
			config?.deliveryProfile === "legacy_all" ||
			config?.deliveryProfile === "personalized_only"
				? config.deliveryProfile
				: "legacy_all",
		safetyMode:
			config?.safetyMode === "observe" || config?.safetyMode === "enforce"
				? config.safetyMode
				: "observe",
		maxRequestsPerFiveMinutes: positiveFiniteOr(config?.maxRequestsPerFiveMinutes, 700),
		heartbeatHours: positiveFiniteOr(config?.heartbeatHours, 24),
		requestTimeoutMs: positiveFiniteOr(config?.requestTimeoutMs, 8_000),
	};
}
