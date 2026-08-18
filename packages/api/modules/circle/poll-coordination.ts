import { randomUUID } from "node:crypto";

import { Redis } from "@upstash/redis";

const LEASE_TTL_MS = 5 * 60 * 1000;
const REQUEST_BUDGET_WINDOW_MS = 5 * 60 * 1000;
const BACKOFF_KEY = "circle:poll:backoff";
const DEFAULT_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const RELEASE_OWNED_LEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
	return redis.call("DEL", KEYS[1])
end
return 0
`;
const CONSUME_REQUEST_BUDGET_SCRIPT = `
local used = redis.call("INCR", KEYS[1])
if used == 1 then
	redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return used
`;
const RECORD_MAX_BACKOFF_SCRIPT = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local proposed = tonumber(ARGV[1])
if proposed > current then
	redis.call("SET", KEYS[1], proposed, "PX", ARGV[2])
	return proposed
end
return current
`;

function leaseKey(scope: string): string {
	return `circle:poll:lease:${encodeURIComponent(scope)}`;
}

export interface PollLeaseResult {
	acquired: boolean;
	ownerToken?: string;
}

export interface PollRequestBudgetResult {
	allowed: boolean;
	used: number;
	limit: number;
	resetAt: Date;
}

export interface PollBackoffResult {
	active: boolean;
	retryAt?: Date;
	retryAfterMs?: number;
}

export interface PollCoordination {
	acquireLease(scope: string, now: Date): Promise<PollLeaseResult>;
	releaseLease(scope: string, ownerToken: string): Promise<boolean>;
	consumeRequestBudget(limit: number, now: Date): Promise<PollRequestBudgetResult>;
	getBackoff(now: Date): Promise<PollBackoffResult>;
	recordRateLimit(retryAfterMs: number | undefined, now: Date): Promise<PollBackoffResult>;
}

type PollCoordinationEnv = Record<string, string | undefined>;

export function createPollCoordinationFromEnv(
	env: PollCoordinationEnv = process.env,
): PollCoordination | null {
	const url = env.UPSTASH_REDIS_REST_URL;
	const token = env.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) {
		return null;
	}

	return new RedisPollCoordination(new Redis({ url, token }));
}

export class RedisPollCoordination implements PollCoordination {
	constructor(private readonly redis: Redis) {}

	async acquireLease(scope: string, _now: Date): Promise<PollLeaseResult> {
		const ownerToken = randomUUID();
		const acquired = await this.redis.set(leaseKey(scope), ownerToken, {
			nx: true,
			px: LEASE_TTL_MS,
		});

		return acquired === "OK" ? { acquired: true, ownerToken } : { acquired: false };
	}

	async releaseLease(scope: string, ownerToken: string): Promise<boolean> {
		const released = await this.redis.eval(
			RELEASE_OWNED_LEASE_SCRIPT,
			[leaseKey(scope)],
			[ownerToken],
		);
		return Number(released) === 1;
	}

	async consumeRequestBudget(limit: number, now: Date): Promise<PollRequestBudgetResult> {
		const nowMs = now.getTime();
		const bucket = Math.floor(nowMs / REQUEST_BUDGET_WINDOW_MS);
		const resetAtMs = (bucket + 1) * REQUEST_BUDGET_WINDOW_MS;
		const ttlMs = Math.max(1, resetAtMs - nowMs);
		const used = Number(
			await this.redis.eval(
				CONSUME_REQUEST_BUDGET_SCRIPT,
				[`circle:poll:budget:${bucket}`],
				[ttlMs],
			),
		);

		return {
			allowed: used <= limit,
			used,
			limit,
			resetAt: new Date(resetAtMs),
		};
	}

	async getBackoff(now: Date): Promise<PollBackoffResult> {
		const storedRetryAt = await this.redis.get<number | string>(BACKOFF_KEY);
		const retryAtMs = Number(storedRetryAt);
		const retryAfterMs = retryAtMs - now.getTime();

		if (!Number.isFinite(retryAtMs) || retryAfterMs <= 0) {
			return { active: false };
		}

		return {
			active: true,
			retryAt: new Date(retryAtMs),
			retryAfterMs,
		};
	}

	async recordRateLimit(retryAfterMs: number | undefined, now: Date): Promise<PollBackoffResult> {
		const requestedDelay =
			typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs > 0
				? retryAfterMs
				: DEFAULT_BACKOFF_MS;
		const boundedDelay = Math.min(requestedDelay, MAX_BACKOFF_MS);
		const proposedRetryAtMs = now.getTime() + boundedDelay;
		const storedRetryAt = await this.redis.eval(
			RECORD_MAX_BACKOFF_SCRIPT,
			[BACKOFF_KEY],
			[proposedRetryAtMs, boundedDelay],
		);
		const storedRetryAtMs = Number(storedRetryAt);

		return {
			active: true,
			retryAt: new Date(storedRetryAtMs),
			retryAfterMs: Math.max(0, storedRetryAtMs - now.getTime()),
		};
	}
}
