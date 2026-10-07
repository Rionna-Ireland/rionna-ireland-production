import { describe, expect, it, vi } from "vitest";

import { memoryLedger, type LedgerEntry } from "../ledger";
import { PENDING_KIND } from "../runtime";
import { runWipe, WIPE_ORDER } from "../wipe";
import { makeCtx } from "./helpers";

const entry = (
	kind: string,
	externalId: string,
	meta: Record<string, unknown> = {},
): LedgerEntry => ({
	kind,
	externalId,
	meta: { key: externalId, ...meta },
});

function fullLedger() {
	return memoryLedger([
		...WIPE_ORDER.map((kind) =>
			entry(kind, `${kind}-1`, {
				spaceId: "E1",
				memberId: "tom-member",
				previousFoundingMember: false,
				previousInboxUnseenCount: 2,
				pinned: ["p1"],
			}),
		),
	]);
}

describe("runWipe ordering", () => {
	it("deletes strictly in WIPE_ORDER, DB rows by ledger id only, and empties the ledger", async () => {
		const ledger = fullLedger();
		const { ctx, writes, calls } = makeCtx({}, ledger);
		const result = await runWipe(ctx);
		expect(result.failures).toEqual([]);
		expect(await ledger.list()).toEqual([]);

		for (const w of writes.filter((x) => x.op === "deleteMany")) {
			expect(w.args.where.id.in).toHaveLength(1); // only the ledger id, never a name/slug match
			expect(Object.keys(w.args.where)).toEqual(["id"]);
		}
		const dbOrder = writes.filter((w) => w.op === "deleteMany").map((w) => w.model);
		const index = (model: string) => dbOrder.indexOf(model);
		expect(index("inboxItem")).toBeLessThan(index("charityConfig"));
		expect(index("charityConfig")).toBeLessThan(index("poll"));
		expect(index("pollVote")).toBeLessThan(index("pollOption"));
		expect(index("pollOption")).toBeLessThan(index("poll"));
		expect(index("postAttribution")).toBeLessThan(index("horse"));
		expect(index("memberPost")).toBeLessThan(index("horse"));
		expect(index("raceEntry")).toBeLessThan(index("race"));
		expect(index("race")).toBeLessThan(index("meeting"));
		expect(index("meeting")).toBeLessThan(index("course"));
		expect(index("horseFollow")).toBeLessThan(index("horse"));
		expect(index("horse")).toBeLessThan(index("trainer"));
		expect(index("user")).toBe(dbOrder.length - 1);

		const circleOrder = calls.map((c) => c.method);
		expect(circleOrder).toEqual(["deletePost", "deleteEvent", "deleteSpace", "deleteMember"]);
	});

	it("keeps the declared order contract", () => {
		const idx = (k: string) => WIPE_ORDER.indexOf(k);
		expect(idx("club_event_meta")).toBeLessThan(idx("circle_event"));
		expect(idx("post_attribution")).toBeLessThan(idx("circle_post"));
		expect(idx("member_post")).toBeLessThan(idx("circle_post"));
		expect(idx("circle_post")).toBeLessThan(idx("circle_comment"));
		expect(idx("circle_event")).toBeLessThan(idx("circle_rsvp"));
		expect(idx("circle_comment")).toBeLessThan(idx("circle_space"));
		expect(idx("circle_space")).toBeLessThan(idx("circle_member"));
		expect(idx("circle_member")).toBeLessThan(idx("user"));
		expect(new Set(WIPE_ORDER).size).toBe(WIPE_ORDER.length);
	});

	it("restores Tom's member state and removes only our pins", async () => {
		const ledger = memoryLedger([
			entry("member_state", "tom-member", {
				memberId: "tom-member",
				previousFoundingMember: false,
				previousInboxUnseenCount: 2,
			}),
			entry("inside_track_pins", "org1", { pinned: ["ours"] }),
		]);
		const { ctx, writes } = makeCtx({}, ledger, {
			dbOverrides: {
				organization: {
					findFirst: () => ({
						id: "org1",
						metadata: JSON.stringify({
							circle: { insideTrack: { pinnedPostIds: ["ours", "real"] } },
						}),
					}),
				},
			},
		});
		await runWipe(ctx);
		const memberWrite = writes.find((w) => w.model === "member");
		expect(memberWrite?.args.data).toEqual({ foundingMember: false, inboxUnseenCount: 2 });
		const orgWrite = writes.find((w) => w.model === "organization");
		expect(JSON.parse(orgWrite!.args.data.metadata).circle.insideTrack.pinnedPostIds).toEqual([
			"real",
		]);
	});

	it("treats a Circle not_found as already gone", async () => {
		const ledger = memoryLedger([entry("circle_post", "99")]);
		const { ctx } = makeCtx({}, ledger);
		(ctx.circle.deletePost as unknown) = vi.fn(async () => ({
			ok: false,
			reason: "not_found",
			retriable: false,
		}));
		const result = await runWipe(ctx);
		expect(result.failures).toEqual([]);
		expect(await ledger.list()).toEqual([]);
	});

	it("keeps ledger entries and reports failures when a Circle delete fails, then carries on", async () => {
		const ledger = memoryLedger([entry("circle_post", "99"), entry("circle_member", "7")]);
		const { ctx, calls } = makeCtx({}, ledger);
		(ctx.circle.deletePost as unknown) = vi.fn(async () => ({
			ok: false,
			reason: "auth",
			retriable: false,
		}));
		const result = await runWipe(ctx);
		expect(result.failures[0]).toMatch(/circle_post/);
		expect((await ledger.list()).map((e) => e.kind)).toEqual(["circle_post"]);
		expect(calls.some((c) => c.method === "deleteMember")).toBe(true);
	});

	it("flags unknown ledger kinds instead of ignoring them, and warns about pending creates", async () => {
		const ledger = memoryLedger([entry("mystery", "1"), entry(PENDING_KIND, "circle_post:x")]);
		const { ctx } = makeCtx({}, ledger);
		const result = await runWipe(ctx);
		expect(result.unknownKinds).toEqual(["mystery"]);
		expect(result.pending).toEqual(["circle_post:x"]);
		expect((await ledger.list()).map((e) => e.kind).sort()).toEqual([
			"circle_pending",
			"mystery",
		]);
	});

	it("dry run deletes nothing", async () => {
		const ledger = fullLedger();
		const { ctx, writes, calls } = makeCtx({ dry: true }, ledger);
		await runWipe(ctx);
		expect(writes).toEqual([]);
		expect(calls).toEqual([]);
		expect((await ledger.list()).length).toBe(WIPE_ORDER.length);
	});
});
