import type { Redis } from "@upstash/redis";
import { describe, expect, it, vi } from "vitest";

import { createPollCoordinationFromEnv, RedisPollCoordination } from "../poll-coordination";

function fakeRedis(overrides: Partial<Redis> = {}): Redis {
	return overrides as Redis;
}

type StoredValue = {
	value: string | number;
	expiresAtMs?: number;
};

/** Minimal Redis semantics needed to exercise lease expiry and fixed-window counters. */
class StatefulFakeRedis {
	private nowMs: number;
	private readonly values = new Map<string, StoredValue>();

	constructor(now: Date) {
		this.nowMs = now.getTime();
	}

	asRedis(): Redis {
		return this as unknown as Redis;
	}

	advanceTo(now: Date): void {
		this.nowMs = now.getTime();
	}

	async set(
		key: string,
		value: string,
		options: { nx?: boolean; px?: number } = {},
	): Promise<"OK" | null> {
		const current = this.getStoredValue(key);
		if (options.nx && current) return null;

		this.values.set(key, {
			value,
			...(options.px === undefined ? {} : { expiresAtMs: this.nowMs + options.px }),
		});
		return "OK";
	}

	async eval(script: string, keys: string[], args: number[]): Promise<number> {
		if (!script.includes("INCR")) {
			throw new Error("StatefulFakeRedis only implements the budget counter script");
		}

		const key = keys[0];
		if (!key) throw new Error("budget script requires one key");
		const current = this.getStoredValue(key);
		const used = Number(current?.value ?? 0) + 1;
		this.values.set(key, {
			value: used,
			expiresAtMs: current?.expiresAtMs ?? this.nowMs + Number(args[0]),
		});
		return used;
	}

	private getStoredValue(key: string): StoredValue | undefined {
		const stored = this.values.get(key);
		if (stored?.expiresAtMs !== undefined && stored.expiresAtMs <= this.nowMs) {
			this.values.delete(key);
			return undefined;
		}
		return stored;
	}
}

describe("createPollCoordinationFromEnv", () => {
	it("returns null when shared Redis is not configured", () => {
		expect(createPollCoordinationFromEnv({})).toBeNull();
	});

	it("creates the production Redis coordinator when both credentials exist", () => {
		expect(
			createPollCoordinationFromEnv({
				UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
				UPSTASH_REDIS_REST_TOKEN: "test-token",
			}),
		).toBeInstanceOf(RedisPollCoordination);
	});
});

describe("RedisPollCoordination leases", () => {
	it("grants a five-minute organization lease with a unique owner token", async () => {
		const set = vi.fn().mockResolvedValue("OK");
		const coordination = new RedisPollCoordination(fakeRedis({ set }));

		const first = await coordination.acquireLease("org-one", new Date("2026-08-18T12:00:00Z"));
		const second = await coordination.acquireLease("org-two", new Date("2026-08-18T12:00:00Z"));

		expect(first.acquired).toBe(true);
		expect(second.acquired).toBe(true);
		expect(first.ownerToken).toEqual(expect.any(String));
		expect(second.ownerToken).not.toBe(first.ownerToken);
		expect(set).toHaveBeenNthCalledWith(1, "circle:poll:lease:org-one", first.ownerToken, {
			nx: true,
			px: 300_000,
		});
		expect(set).toHaveBeenNthCalledWith(2, "circle:poll:lease:org-two", second.ownerToken, {
			nx: true,
			px: 300_000,
		});
	});

	it("releases a lease only when the caller still owns it", async () => {
		const evalCommand = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
		const coordination = new RedisPollCoordination(
			fakeRedis({ eval: evalCommand as Redis["eval"] }),
		);

		await expect(coordination.releaseLease("org-one", "owner-a")).resolves.toBe(true);
		await expect(coordination.releaseLease("org-one", "stale-owner")).resolves.toBe(false);
		expect(evalCommand).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining('redis.call("GET", KEYS[1]) == ARGV[1]'),
			["circle:poll:lease:org-one"],
			["owner-a"],
		);
	});

	it("reports a lease collision without exposing an owner token", async () => {
		const coordination = new RedisPollCoordination(
			fakeRedis({ set: vi.fn().mockResolvedValue(null) }),
		);

		await expect(
			coordination.acquireLease("org-one", new Date("2026-08-18T12:00:00Z")),
		).resolves.toEqual({ acquired: false });
	});

	it("lets another process reacquire a crashed owner's lease after five minutes", async () => {
		const startedAt = new Date("2026-08-18T12:00:00Z");
		const redis = new StatefulFakeRedis(startedAt);
		const crashedProcess = new RedisPollCoordination(redis.asRedis());
		const recoveryProcess = new RedisPollCoordination(redis.asRedis());

		const crashedLease = await crashedProcess.acquireLease("org-one", startedAt);
		expect(crashedLease.acquired).toBe(true);

		const beforeExpiry = new Date("2026-08-18T12:04:59.999Z");
		redis.advanceTo(beforeExpiry);
		await expect(recoveryProcess.acquireLease("org-one", beforeExpiry)).resolves.toEqual({
			acquired: false,
		});

		const atExpiry = new Date("2026-08-18T12:05:00Z");
		redis.advanceTo(atExpiry);
		const recoveredLease = await recoveryProcess.acquireLease("org-one", atExpiry);
		expect(recoveredLease).toMatchObject({ acquired: true });
		expect(recoveredLease.ownerToken).not.toBe(crashedLease.ownerToken);
	});
});

describe("RedisPollCoordination request budget", () => {
	it("atomically shares a global fixed five-minute request budget", async () => {
		const evalCommand = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(701);
		const redis = fakeRedis({ eval: evalCommand as Redis["eval"] });
		const processOne = new RedisPollCoordination(redis);
		const processTwo = new RedisPollCoordination(redis);
		const now = new Date("2026-08-18T12:02:03Z");

		await expect(processOne.consumeRequestBudget(700, now)).resolves.toEqual({
			allowed: true,
			used: 1,
			limit: 700,
			resetAt: new Date("2026-08-18T12:05:00Z"),
		});
		await expect(processTwo.consumeRequestBudget(700, now)).resolves.toEqual({
			allowed: false,
			used: 701,
			limit: 700,
			resetAt: new Date("2026-08-18T12:05:00Z"),
		});
		expect(evalCommand).toHaveBeenNthCalledWith(
			1,
			expect.stringMatching(/INCR[\s\S]*PEXPIRE/),
			["circle:poll:budget:5956848"],
			[177_000],
		);
		expect(evalCommand).toHaveBeenNthCalledWith(
			2,
			expect.any(String),
			["circle:poll:budget:5956848"],
			[177_000],
		);
	});

	it("starts a fresh shared budget in the next fixed five-minute window", async () => {
		const firstWindow = new Date("2026-08-18T12:04:59.900Z");
		const redis = new StatefulFakeRedis(firstWindow);
		const processOne = new RedisPollCoordination(redis.asRedis());
		const processTwo = new RedisPollCoordination(redis.asRedis());

		await expect(processOne.consumeRequestBudget(1, firstWindow)).resolves.toMatchObject({
			allowed: true,
			used: 1,
			resetAt: new Date("2026-08-18T12:05:00Z"),
		});
		await expect(processTwo.consumeRequestBudget(1, firstWindow)).resolves.toMatchObject({
			allowed: false,
			used: 2,
		});

		const nextWindow = new Date("2026-08-18T12:05:00Z");
		redis.advanceTo(nextWindow);
		await expect(processTwo.consumeRequestBudget(1, nextWindow)).resolves.toMatchObject({
			allowed: true,
			used: 1,
			resetAt: new Date("2026-08-18T12:10:00Z"),
		});
	});
});

describe("RedisPollCoordination global backoff", () => {
	it("reports a shared backoff only while its retry time is in the future", async () => {
		const retryAtMs = Date.parse("2026-08-18T12:01:00Z");
		const get = vi.fn().mockResolvedValueOnce(retryAtMs).mockResolvedValueOnce(retryAtMs);
		const coordination = new RedisPollCoordination(fakeRedis({ get }));

		await expect(coordination.getBackoff(new Date("2026-08-18T12:00:30Z"))).resolves.toEqual({
			active: true,
			retryAt: new Date("2026-08-18T12:01:00Z"),
			retryAfterMs: 30_000,
		});
		await expect(coordination.getBackoff(new Date("2026-08-18T12:01:00Z"))).resolves.toEqual({
			active: false,
		});
		expect(get).toHaveBeenCalledWith("circle:poll:backoff");
	});

	it("records the provided rate-limit delay in a shared global backoff", async () => {
		const retryAtMs = Date.parse("2026-08-18T12:00:30Z");
		const evalCommand = vi.fn().mockResolvedValue(retryAtMs);
		const coordination = new RedisPollCoordination(
			fakeRedis({ eval: evalCommand as Redis["eval"] }),
		);

		await expect(
			coordination.recordRateLimit(30_000, new Date("2026-08-18T12:00:00Z")),
		).resolves.toEqual({
			active: true,
			retryAt: new Date("2026-08-18T12:00:30Z"),
			retryAfterMs: 30_000,
		});
		expect(evalCommand).toHaveBeenCalledWith(
			expect.stringMatching(/GET[\s\S]*SET/),
			["circle:poll:backoff"],
			[retryAtMs, 30_000],
		);
	});

	it("uses a 60-second fallback and caps excessive delays at five minutes", async () => {
		const evalCommand = vi.fn((_script: string, _keys: string[], args: number[]) =>
			Promise.resolve(args[0]),
		);
		const coordination = new RedisPollCoordination(
			fakeRedis({ eval: evalCommand as Redis["eval"] }),
		);
		const now = new Date("2026-08-18T12:00:00Z");

		await expect(coordination.recordRateLimit(undefined, now)).resolves.toMatchObject({
			retryAt: new Date("2026-08-18T12:01:00Z"),
			retryAfterMs: 60_000,
		});
		await expect(coordination.recordRateLimit(900_000, now)).resolves.toMatchObject({
			retryAt: new Date("2026-08-18T12:05:00Z"),
			retryAfterMs: 300_000,
		});
		expect(evalCommand.mock.calls[0]?.[2]?.[1]).toBe(60_000);
		expect(evalCommand.mock.calls[1]?.[2]?.[1]).toBe(300_000);
	});
});
