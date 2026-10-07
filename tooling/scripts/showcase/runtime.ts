/**
 * S13-17 shared runtime for seed + wipe: the context object, ledger-backed
 * "ensure" helpers (record-before-create, idempotent skip) and the Circle call
 * wrapper that pauses on rate limits.
 */
import type { db as Db } from "@repo/database";
import type { CircleService } from "@repo/payments/lib/circle";
import type { CircleCallOutcome } from "@repo/payments/lib/circle/types";

import { dbId, type Ledger } from "./ledger";

export type ShowcaseDb = typeof Db;

/** The only Circle operations the showcase may perform. */
export type ShowcaseCircle = Pick<
	CircleService,
	| "createMember"
	| "deleteMember"
	| "createSpace"
	| "deleteSpace"
	| "addSpaceMember"
	| "createPost"
	| "deletePost"
	| "createComment"
	| "likePost"
	| "createEvent"
	| "deleteEvent"
	| "rsvpEvent"
	| "uploadImage"
	| "createEmbed"
	| "listSpaces"
>;

export interface ShowcaseCtx {
	db: ShowcaseDb;
	circle: ShowcaseCircle;
	ledger: Ledger;
	/** Plan only: no DB writes, no Circle calls, no ledger writes. */
	dry: boolean;
	log: (message: string) => void;
	sleep: (ms: number) => Promise<void>;
	/** Minimum gap between Circle writes, to stay under the rate limit. */
	paceMs: number;
	now: Date;
	/** `${kind}:${key}` -> externalId, for cross-references between steps. */
	refs: Map<string, string>;
	counts: Map<string, { created: number; skipped: number }>;
}

export class CircleCallError extends Error {
	constructor(
		readonly label: string,
		readonly reason: string,
		readonly raw?: unknown,
	) {
		super(`[showcase] Circle call failed: ${label} (${reason})`);
		this.name = "CircleCallError";
	}
}

const MAX_RATE_LIMIT_PAUSES = 10;
const MAX_TRANSIENT_RETRIES = 3;
const DEFAULT_RATE_LIMIT_PAUSE_MS = 30_000;

/**
 * Run a Circle call, pausing + retrying on 429 and backing off on transient
 * errors. Returns the final outcome (never throws on a Circle failure).
 */
export async function callCircleOutcome<T>(
	ctx: Pick<ShowcaseCtx, "sleep" | "paceMs" | "log">,
	label: string,
	fn: () => Promise<CircleCallOutcome<T>>,
): Promise<CircleCallOutcome<T>> {
	let rateLimited = 0;
	let transient = 0;
	for (;;) {
		if (ctx.paceMs > 0) await ctx.sleep(ctx.paceMs);
		const outcome = await fn();
		if (outcome.ok) return outcome;
		if (outcome.reason === "rate_limited" && rateLimited < MAX_RATE_LIMIT_PAUSES) {
			rateLimited++;
			const wait = outcome.retryAfterMs ?? DEFAULT_RATE_LIMIT_PAUSE_MS;
			ctx.log(`  rate limited on ${label}; pausing ${Math.round(wait / 1000)}s`);
			await ctx.sleep(wait);
			continue;
		}
		if (
			(outcome.reason === "network" || outcome.reason === "server_error") &&
			transient < MAX_TRANSIENT_RETRIES
		) {
			transient++;
			await ctx.sleep(2_000 * transient);
			continue;
		}
		return outcome;
	}
}

/** Like callCircleOutcome, but unwraps the data and throws CircleCallError on failure. */
export async function callCircle<T>(
	ctx: Pick<ShowcaseCtx, "sleep" | "paceMs" | "log">,
	label: string,
	fn: () => Promise<CircleCallOutcome<T>>,
): Promise<T> {
	const outcome = await callCircleOutcome(ctx, label, fn);
	if (outcome.ok) return outcome.data;
	throw new CircleCallError(label, outcome.reason, outcome.raw);
}

function bump(ctx: ShowcaseCtx, kind: string, which: "created" | "skipped") {
	const c = ctx.counts.get(kind) ?? { created: 0, skipped: 0 };
	c[which]++;
	ctx.counts.set(kind, c);
}

export function isPrimaryKeyViolation(error: unknown): boolean {
	const e = error as { code?: string; meta?: { target?: unknown } } | null;
	if (e?.code !== "P2002") return false;
	return /(^|[^A-Za-z])id([^A-Za-z]|$)|pkey/.test(
		String((e.meta?.target as string | string[] | undefined) ?? ""),
	);
}

/**
 * Create a DB row exactly once. The ledger entry is written BEFORE the row
 * (marked pending), so a crash mid-create is still wipeable and a re-run
 * finishes the job. Returns the row id.
 */
export async function ensureDb(
	ctx: ShowcaseCtx,
	kind: string,
	key: string,
	create: (id: string) => Promise<unknown>,
	meta: Record<string, unknown> = {},
): Promise<string> {
	const existing = await ctx.ledger.find(kind, key);
	const id = existing?.externalId ?? dbId(kind, key);
	ctx.refs.set(`${kind}:${key}`, id);
	if (existing && !existing.meta.pending) {
		bump(ctx, kind, "skipped");
		return id;
	}
	bump(ctx, kind, "created");
	if (ctx.dry) {
		ctx.log(`  [dry] would create ${kind} ${key}`);
		return id;
	}
	await ctx.ledger.record(kind, id, { key, pending: true, ...meta });
	try {
		await create(id);
	} catch (error) {
		if (!isPrimaryKeyViolation(error)) throw error;
	}
	await ctx.ledger.record(kind, id, { key, ...meta });
	return id;
}

/**
 * Create a Circle object exactly once. Circle assigns the id, so a
 * `circle_pending` marker is written first; the real ledger entry replaces it
 * the moment Circle answers. A leftover marker means a crash between the two
 * (possible orphan in Circle), which seed/wipe refuse to ignore silently.
 */
export async function ensureCircle(
	ctx: ShowcaseCtx,
	kind: string,
	key: string,
	create: () => Promise<{ id: string; meta?: Record<string, unknown> }>,
	meta: Record<string, unknown> = {},
): Promise<string> {
	const existing = await ctx.ledger.find(kind, key);
	if (existing) {
		ctx.refs.set(`${kind}:${key}`, existing.externalId);
		bump(ctx, kind, "skipped");
		return existing.externalId;
	}
	bump(ctx, kind, "created");
	if (ctx.dry) {
		ctx.log(`  [dry] would create ${kind} ${key}`);
		const placeholder = `dry-${kind}-${key}`;
		ctx.refs.set(`${kind}:${key}`, placeholder);
		return placeholder;
	}
	const pendingId = `${kind}:${key}`;
	await ctx.ledger.record(PENDING_KIND, pendingId, { key, kind });
	const created = await create();
	await ctx.ledger.record(kind, created.id, { key, ...meta, ...created.meta });
	await ctx.ledger.remove(PENDING_KIND, pendingId);
	ctx.refs.set(`${kind}:${key}`, created.id);
	return created.id;
}

export const PENDING_KIND = "circle_pending";

export function ref(ctx: ShowcaseCtx, kind: string, key: string): string {
	const value = ctx.refs.get(`${kind}:${key}`);
	if (!value) throw new Error(`[showcase] missing reference ${kind}:${key} (seed order bug)`);
	return value;
}
