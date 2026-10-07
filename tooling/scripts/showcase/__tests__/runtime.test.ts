import { describe, expect, it, vi } from "vitest";

import { personaEmail, parseFlags } from "../cli";
import { memoryLedger } from "../ledger";
import {
	callCircle,
	CircleCallError,
	ensureCircle,
	ensureDb,
	isPrimaryKeyViolation,
	PENDING_KIND,
} from "../runtime";
import { makeCtx } from "./helpers";

describe("ensureDb", () => {
	it("writes a pending ledger row before create, confirms it after, and skips next time", async () => {
		const { ctx, ledger } = makeCtx();
		const seen: unknown[] = [];
		const create = vi.fn(async (id: string) => {
			seen.push(
				(await ledger.list()).map((e) => ({ id: e.externalId, pending: e.meta.pending })),
			);
			void id;
		});
		const id = await ensureDb(ctx, "horse", "a", create);
		expect(seen).toEqual([[{ id, pending: true }]]);
		expect((await ledger.list())[0].meta.pending).toBeUndefined();
		await ensureDb(ctx, "horse", "a", create);
		expect(create).toHaveBeenCalledTimes(1);
		expect(ctx.counts.get("horse")).toEqual({ created: 1, skipped: 1 });
	});

	it("finishes a crashed create (pending entry) and tolerates the row already existing", async () => {
		const ledger = memoryLedger([
			{ kind: "horse", externalId: "showcase_horse_a", meta: { key: "a", pending: true } },
		]);
		const { ctx } = makeCtx({}, ledger);
		const create = vi.fn(async () => {
			throw { code: "P2002", meta: { target: ["id"] } };
		});
		await expect(ensureDb(ctx, "horse", "a", create)).resolves.toBe("showcase_horse_a");
		expect(create).toHaveBeenCalledTimes(1);
		expect((await ledger.list())[0].meta.pending).toBeUndefined();
	});

	it("does not swallow a unique violation on a natural key (someone else's row)", async () => {
		const { ctx } = makeCtx();
		const clash = { code: "P2002", meta: { target: ["organizationId", "slug"] } };
		expect(isPrimaryKeyViolation(clash)).toBe(false);
		await expect(
			ensureDb(ctx, "horse", "a", async () => {
				throw clash;
			}),
		).rejects.toBe(clash);
	});
});

describe("ensureCircle", () => {
	it("marks a pending create first, records the Circle id on success and skips next time", async () => {
		const { ctx, ledger } = makeCtx();
		const create = vi.fn(async () => {
			expect((await ledger.list()).map((e) => e.kind)).toEqual([PENDING_KIND]);
			return { id: "555", meta: { spaceId: "9" } };
		});
		expect(await ensureCircle(ctx, "circle_post", "p1", create)).toBe("555");
		const entries = await ledger.list();
		expect(entries).toEqual([
			expect.objectContaining({
				kind: "circle_post",
				externalId: "555",
				meta: { key: "p1", spaceId: "9" },
			}),
		]);
		expect(await ensureCircle(ctx, "circle_post", "p1", create)).toBe("555");
		expect(create).toHaveBeenCalledTimes(1);
	});

	it("leaves the pending marker when the create throws", async () => {
		const { ctx, ledger } = makeCtx();
		await expect(
			ensureCircle(ctx, "circle_post", "p1", async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect((await ledger.list()).map((e) => e.kind)).toEqual([PENDING_KIND]);
	});

	it("does nothing in a dry run", async () => {
		const { ctx, ledger } = makeCtx({ dry: true });
		const create = vi.fn();
		await ensureCircle(ctx, "circle_post", "p1", create);
		expect(create).not.toHaveBeenCalled();
		expect(await ledger.list()).toEqual([]);
	});
});

describe("callCircle rate limiting", () => {
	it("pauses for Retry-After on 429 then succeeds", async () => {
		const { ctx } = makeCtx();
		const fn = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				reason: "rate_limited",
				retriable: true,
				retryAfterMs: 12_000,
			})
			.mockResolvedValueOnce({ ok: true, data: 5 });
		await expect(callCircle(ctx, "x", fn)).resolves.toBe(5);
		expect(ctx.sleep).toHaveBeenCalledWith(12_000);
	});

	it("falls back to a 30s pause when Circle gives no hint", async () => {
		const { ctx } = makeCtx();
		const fn = vi
			.fn()
			.mockResolvedValueOnce({ ok: false, reason: "rate_limited", retriable: true })
			.mockResolvedValueOnce({ ok: true, data: 1 });
		await callCircle(ctx, "x", fn);
		expect(ctx.sleep).toHaveBeenCalledWith(30_000);
	});

	it("throws a CircleCallError on a hard failure without retrying", async () => {
		const { ctx } = makeCtx();
		const fn = vi.fn().mockResolvedValue({ ok: false, reason: "forbidden", retriable: false });
		await expect(callCircle(ctx, "x", fn)).rejects.toBeInstanceOf(CircleCallError);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("paces writes", async () => {
		const { ctx } = makeCtx({ paceMs: 400 });
		await callCircle(ctx, "x", async () => ({ ok: true as const, data: 1 }));
		expect(ctx.sleep).toHaveBeenCalledWith(400);
	});
});

describe("cli", () => {
	it("parses flags in both forms", () => {
		const f = parseFlags([
			"--dry-run",
			"--base-email",
			"a@b.ie",
			"--tom-email=t@b.ie",
			"--reset",
		]);
		expect(f).toMatchObject({
			dryRun: true,
			reset: true,
			baseEmail: "a@b.ie",
			tomEmail: "t@b.ie",
			orgSlug: "rionna",
		});
		expect(() => parseFlags(["--wat"])).toThrow(/Unknown flag/);
		expect(() => parseFlags(["--base-email"])).toThrow(/needs a value/);
	});

	it("builds +seed persona emails and rejects tagged base addresses", () => {
		expect(personaEmail("google@rionna.com", "maeve")).toBe("google+seed-maeve@rionna.com");
		expect(() => personaEmail("google+x@rionna.com", "maeve")).toThrow();
		expect(() => personaEmail("nope", "maeve")).toThrow();
	});
});
