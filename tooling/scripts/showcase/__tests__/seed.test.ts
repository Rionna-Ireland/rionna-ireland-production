import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryLedger } from "../ledger";
import { PENDING_KIND } from "../runtime";
import { runSeed, SEED_NOTIFIED_STATES } from "../seed";
import { WIPE_ORDER } from "../wipe";
import { makeCtx } from "./helpers";
import { EVENTS, HORSES, POSTS, SpaceKeyList } from "./space-list";

const flags = {
	dryRun: false,
	reset: false,
	baseEmail: "club@example.com",
	tomEmail: "tom@example.com",
	orgSlug: "rionna",
	allowPending: false,
	allowMockCircle: false,
};
const fetchImageBytes = vi.fn(async () => ({
	data: new Uint8Array([1, 2, 3]),
	contentType: "image/jpeg",
	filename: "x.jpg",
}));
const options = (
	over: Partial<
		Omit<typeof flags, "baseEmail" | "tomEmail"> & {
			baseEmail: string | null;
			tomEmail: string | null;
		}
	> = {},
) => ({ flags: { ...flags, ...over } as never, fetchImageBytes });

const fetchSpy = vi.fn();
beforeEach(() => {
	fetchSpy.mockClear();
	vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const CIRCLE_WRITES = [
	"createMember",
	"createSpace",
	"addSpaceMember",
	"createPost",
	"createComment",
	"likePost",
	"createEvent",
	"rsvpEvent",
	"uploadImage",
	"createEmbed",
] as const;

describe("runSeed: ledger idempotency", () => {
	it("records every created thing in the ledger and a re-run creates nothing", async () => {
		const first = makeCtx();
		await runSeed(first.ctx, options());
		expect(first.writes.length).toBeGreaterThan(100);
		expect(first.calls.filter((c) => c.method === "createPost").length).toBeGreaterThan(30);

		const { ctx, writes, calls } = makeCtx({}, first.ledger);
		ctx.refs.clear();
		await runSeed(ctx, options());
		expect(writes).toEqual([]);
		expect(
			calls.filter((c) => (CIRCLE_WRITES as readonly string[]).includes(c.method)),
		).toEqual([]);
	});

	it("only ever records kinds that wipe knows how to remove, with no pending leftovers", async () => {
		const { ctx, ledger } = makeCtx();
		await runSeed(ctx, options());
		const kinds = new Set((await ledger.list()).map((e) => e.kind));
		for (const kind of kinds) expect(WIPE_ORDER).toContain(kind);
		expect(kinds.has(PENDING_KIND)).toBe(false);
		expect(kinds.has("circle_post")).toBe(true);
		expect(kinds.has("circle_member")).toBe(true);
	});

	it("records DB ledger entries before creating the row", async () => {
		const events: string[] = [];
		const ledger = memoryLedger();
		const record = ledger.record.bind(ledger);
		ledger.record = async (kind, id, meta) => {
			if (kind === "trainer") events.push(`ledger:${meta.pending ? "pending" : "done"}`);
			await record(kind, id, meta);
		};
		const { ctx } = makeCtx({}, ledger, { events });
		await runSeed(ctx, options());
		const trainer = events.filter((e) => e.startsWith("ledger:") || e === "trainer.create");
		expect(trainer).toEqual(["ledger:pending", "trainer.create", "ledger:done"]);
	});

	it("refuses to run with interrupted Circle creates unless --allow-pending", async () => {
		const ledger = memoryLedger([
			{
				kind: PENDING_KIND,
				externalId: "circle_post:x",
				meta: { key: "x", kind: "circle_post" },
			},
		]);
		const { ctx } = makeCtx({}, ledger);
		await expect(runSeed(ctx, options())).rejects.toThrow(/interrupted/);
		await expect(
			runSeed(makeCtx({}, ledger).ctx, options({ allowPending: true })),
		).resolves.toBeUndefined();
	});

	it("requires --base-email (no default real address)", async () => {
		const { ctx } = makeCtx();
		await expect(runSeed(ctx, options({ baseEmail: null }))).rejects.toThrow(/--base-email/);
	});
});

describe("runSeed: content coverage", () => {
	it("creates personas with +seed emails on the supplied base address only", async () => {
		const { ctx, calls } = makeCtx();
		await runSeed(ctx, options());
		const emails = calls
			.filter((c) => c.method === "createMember")
			.map((c) => c.args.email as string);
		expect(emails.length).toBe(8);
		for (const email of emails) expect(email).toMatch(/^club\+seed-[a-z]+@example\.com$/);
	});

	it("covers every space, every event type, every inbox kind, and the S13 fields", async () => {
		const { ctx, writes, calls } = makeCtx();
		await runSeed(ctx, options());
		const postSpaces = new Set(
			calls.filter((c) => c.method === "createPost").map((c) => c.args.spaceId),
		);
		for (const id of [
			"2896718",
			"2695469",
			"2896719",
			"2695471",
			"2695473",
			"2695465",
			"2695457",
			"IT1",
		]) {
			expect(postSpaces.has(id)).toBe(true);
		}
		const types = new Set(
			writes.filter((w) => w.model === "clubEventMeta").map((w) => w.args.data.type),
		);
		expect([...types].sort((a, b) => a.localeCompare(b))).toEqual([
			"OTHER",
			"QA",
			"RACE_DAY",
			"SOCIAL",
			"STABLE_VISIT",
		]);
		expect(
			writes
				.filter((w) => w.model === "clubEventMeta")
				.every((w) => w.args.data.startsAt instanceof Date),
		).toBe(true);

		const kinds = new Set(
			writes.filter((w) => w.model === "inboxItem").map((w) => w.args.data.kind),
		);
		expect(kinds.size).toBe(13);

		const horses = writes
			.filter((w) => w.model === "horse" && w.op === "create")
			.map((w) => w.args.data);
		expect(horses).toHaveLength(6);
		expect(horses.some((h) => h.inviteOnly)).toBe(true);
		expect(horses.every((h) => h.colour && h.sex && h.foaledOn && h.foaledPlace)).toBe(true);
		expect(writes.filter((w) => w.model === "horseWellbeing")).toHaveLength(6);

		const entries = writes.filter((w) => w.model === "raceEntry").map((w) => w.args.data);
		expect(entries.some((e) => e.status === "DECLARED")).toBe(true);
		expect(entries.some((e) => e.status === "NON_RUNNER")).toBe(true);
		expect(entries.filter((e) => e.status === "RAN").every((e) => e.fieldSize > 0)).toBe(true);

		expect(writes.filter((w) => w.model === "postAttribution").length).toBeGreaterThan(3);
		expect(writes.filter((w) => w.model === "poll")).toHaveLength(4);
		expect(writes.filter((w) => w.model === "partnerOffer").length).toBeGreaterThanOrEqual(6);
		expect(writes.filter((w) => w.model === "charityConfig")).toHaveLength(1);
		const member = writes.find((w) => w.model === "member");
		expect(member?.args.data).not.toHaveProperty("foundingMember");
	});

	it("skips Tom-specific content when no --tom-email is given", async () => {
		const { ctx, writes } = makeCtx();
		await runSeed(ctx, options({ tomEmail: null }));
		expect(
			writes.some(
				(w) => w.model === "inboxItem" || w.model === "horseFollow" || w.model === "member",
			),
		).toBe(false);
	});
});

describe("runSeed: push suppression", () => {
	it("never sends a push or touches the network directly", async () => {
		const { ctx } = makeCtx();
		await runSeed(ctx, options());
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("never imports the push service", async () => {
		const { readFileSync } = await import("node:fs");
		const { resolve } = await import("node:path");
		for (const file of ["seed.ts", "wipe.ts", "runtime.ts", "bootstrap.ts"]) {
			const src = readFileSync(resolve(__dirname, "..", file), "utf8");
			expect(src).not.toMatch(/modules\/push|sendPush|expo-server-sdk/);
		}
	});

	it("pre-sets every notification marker so no cron or hook re-fires", async () => {
		const { ctx, writes, calls } = makeCtx();
		await runSeed(ctx, options());
		for (const w of writes.filter((x) => x.model === "raceEntry")) {
			expect(w.args.data.notifiedStates).toEqual(SEED_NOTIFIED_STATES);
			expect(w.args.data.notifiedStates).toEqual(
				expect.arrayContaining(["DECLARED", "RAN", "NON_RUNNER"]),
			);
		}
		for (const w of writes.filter((x) => x.model === "poll"))
			expect(w.args.data.notifiedAt).toBeInstanceOf(Date);
		for (const w of writes.filter((x) => x.model === "newsPost")) {
			expect(w.args.data.notifyMembersOnPublish).toBe(false);
			expect(w.args.data.notificationSentAt).toBeInstanceOf(Date);
		}
		for (const w of writes.filter((x) => x.model === "inboxItem")) {
			expect(w.args.data.lastPushedAt).toBeInstanceOf(Date);
		}
		for (const c of calls.filter((x) => x.method === "createPost")) {
			expect(c.args.skipNotifications).toBe(true);
		}
	});
});

describe("runSeed: dry run", () => {
	it("makes no DB, ledger or Circle writes and no network calls", async () => {
		const { ctx, writes, calls, ledger } = makeCtx({ dry: true });
		await runSeed(ctx, options({ dryRun: true }));
		expect(writes).toEqual([]);
		expect(calls).toEqual([]);
		expect(await ledger.list()).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(ctx.counts.get("horse")?.created).toBe(6);
	});
});

describe("fixtures", () => {
	it("match the spec's counts and shape", () => {
		expect(HORSES).toHaveLength(6);
		for (const h of HORSES) {
			expect(h.runs.length).toBeGreaterThanOrEqual(3);
			expect(h.runs.length).toBeLessThanOrEqual(10);
			expect(h.updates.length).toBeGreaterThanOrEqual(4);
			expect(h.updates.length).toBeLessThanOrEqual(8);
			for (const r of h.runs) expect(r.position).toBeLessThanOrEqual(r.field);
		}
		expect(new Set(HORSES.map((h) => h.sex)).size).toBeGreaterThanOrEqual(3);
		expect(EVENTS.length).toBeGreaterThanOrEqual(6);
		expect(EVENTS.length).toBeLessThanOrEqual(8);
		expect(POSTS.length).toBeGreaterThanOrEqual(25);
		expect(Math.max(...POSTS.map((p) => p.comments?.length ?? 0))).toBe(30);
		for (const key of SpaceKeyList) expect(POSTS.some((p) => p.space === key)).toBe(true);
		expect(POSTS.some((p) => p.space.startsWith("horse:"))).toBe(true);
		const text = JSON.stringify([HORSES, EVENTS, POSTS]);
		expect(text).not.toMatch(/lorem|ipsum/i);
	});
});
