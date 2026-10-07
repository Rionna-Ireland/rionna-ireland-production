/**
 * S13-17 staging showcase wipe.
 *
 *   pnpm showcase:wipe:staging [-- --dry-run]
 *
 * Deletes everything the seed created, driven by `seed_ledger` ONLY (never by
 * name match), in reverse dependency order. Run it before launch: seeded
 * Circle content lives in the community shared with production.
 */
import { parseFlags } from "./cli";
import type { LedgerEntry } from "./ledger";
import { callCircleOutcome, PENDING_KIND, type ShowcaseCtx } from "./runtime";

type Handler = (ctx: ShowcaseCtx, entries: LedgerEntry[]) => Promise<void>;

/** How a kind is removed. `ledgerOnly` kinds disappear with their Circle parent (post/event). */
interface WipeStep {
	kind: string;
	run: Handler;
}

const ids = (entries: LedgerEntry[]) => entries.map((e) => e.externalId);

const dbDelete =
	(
		model: (ctx: ShowcaseCtx) => {
			deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<unknown>;
		},
	): Handler =>
	async (ctx, entries) => {
		await model(ctx).deleteMany({ where: { id: { in: ids(entries) } } });
	};

/** Circle delete where "already gone" counts as success. */
const circleDelete =
	(
		label: string,
		call: (
			ctx: ShowcaseCtx,
			entry: LedgerEntry,
		) => ReturnType<ShowcaseCtx["circle"]["deletePost"]>,
	): Handler =>
	async (ctx, entries) => {
		const failures: string[] = [];
		for (const entry of entries) {
			const outcome = await callCircleOutcome(ctx, `${label} ${entry.externalId}`, () =>
				call(ctx, entry),
			);
			if (outcome.ok || outcome.reason === "not_found") {
				await ctx.ledger.remove(entry.kind, entry.externalId);
			} else {
				failures.push(`${entry.externalId} (${outcome.reason})`);
			}
		}
		if (failures.length > 0) throw new Error(`${label} failed for: ${failures.join(", ")}`);
	};

/** Children of a Circle post/event/space: removed by Circle when the parent goes. */
const ledgerOnly: Handler = async () => {};

/**
 * Reverse dependency order, first to last:
 * notifications and per-account state -> content that references other rows ->
 * racing data -> Circle posts/events (their comments, likes, RSVPs go with
 * them) -> Circle spaces -> persona Circle members -> persona users.
 */
export const WIPE_STEPS: WipeStep[] = [
	{ kind: "inbox_item", run: dbDelete((c) => c.db.inboxItem) },
	{
		kind: "member_state",
		run: async (ctx, entries) => {
			for (const e of entries) {
				const memberId = String((e.meta.memberId as string | undefined) ?? e.externalId);
				await ctx.db.member.updateMany({
					where: { id: memberId },
					data: {
						foundingMember: Boolean(e.meta.previousFoundingMember),
						inboxUnseenCount: Number(e.meta.previousInboxUnseenCount ?? 0),
					},
				});
			}
		},
	},
	{ kind: "charity_config", run: dbDelete((c) => c.db.charityConfig) },
	{ kind: "poll_vote", run: dbDelete((c) => c.db.pollVote) },
	{ kind: "poll_option", run: dbDelete((c) => c.db.pollOption) },
	{ kind: "poll", run: dbDelete((c) => c.db.poll) },
	{ kind: "partner_offer", run: dbDelete((c) => c.db.partnerOffer) },
	{ kind: "news_post", run: dbDelete((c) => c.db.newsPost) },
	{
		kind: "inside_track_pins",
		run: async (ctx, entries) => {
			// Remove exactly the pins we added; leave any real pins untouched.
			const ours = new Set(
				entries.flatMap((e) =>
					Array.isArray(e.meta.pinned) ? (e.meta.pinned as string[]) : [],
				),
			);
			const org = await ctx.db.organization.findFirst({
				where: { id: { in: ids(entries) } },
			});
			if (!org) return;
			let meta: { circle?: { insideTrack?: { pinnedPostIds?: string[] } } } = {};
			try {
				meta = org.metadata ? JSON.parse(org.metadata) : {};
			} catch {
				return;
			}
			const pins = meta.circle?.insideTrack?.pinnedPostIds;
			if (!pins) return;
			meta.circle!.insideTrack!.pinnedPostIds = pins.filter((id) => !ours.has(id));
			await ctx.db.organization.update({
				where: { id: org.id },
				data: { metadata: JSON.stringify(meta) },
			});
		},
	},
	{ kind: "post_attribution", run: dbDelete((c) => c.db.postAttribution) },
	{ kind: "member_post", run: dbDelete((c) => c.db.memberPost) },
	{ kind: "club_event_meta", run: dbDelete((c) => c.db.clubEventMeta) },
	{ kind: "horse_links", run: ledgerOnly },
	{ kind: "horse_follow", run: dbDelete((c) => c.db.horseFollow) },
	{ kind: "race_entry", run: dbDelete((c) => c.db.raceEntry) },
	{ kind: "race", run: dbDelete((c) => c.db.race) },
	{ kind: "meeting", run: dbDelete((c) => c.db.meeting) },
	{ kind: "course", run: dbDelete((c) => c.db.course) },
	{ kind: "horse_wellbeing", run: dbDelete((c) => c.db.horseWellbeing) },
	{ kind: "horse", run: dbDelete((c) => c.db.horse) },
	{ kind: "jockey", run: dbDelete((c) => c.db.jockey) },
	{ kind: "trainer", run: dbDelete((c) => c.db.trainer) },
	{
		kind: "circle_post",
		run: circleDelete("deletePost", (ctx, e) => ctx.circle.deletePost(e.externalId)),
	},
	{
		kind: "circle_event",
		run: circleDelete("deleteEvent", (ctx, e) =>
			ctx.circle.deleteEvent({
				eventId: e.externalId,
				spaceId: String((e.meta.spaceId as string | undefined) ?? ""),
			}),
		),
	},
	{ kind: "circle_comment", run: ledgerOnly },
	{ kind: "circle_like", run: ledgerOnly },
	{ kind: "circle_rsvp", run: ledgerOnly },
	{ kind: "circle_space_member", run: ledgerOnly },
	{
		kind: "circle_space",
		run: circleDelete("deleteSpace", (ctx, e) => ctx.circle.deleteSpace(e.externalId)),
	},
	{
		kind: "circle_member",
		run: circleDelete("deleteMember", (ctx, e) => ctx.circle.deleteMember(e.externalId)),
	},
	{ kind: "user", run: dbDelete((c) => c.db.user) },
];

export const WIPE_ORDER = WIPE_STEPS.map((s) => s.kind);

export interface WipeResult {
	removed: Map<string, number>;
	failures: string[];
	unknownKinds: string[];
	pending: string[];
}

export async function runWipe(ctx: ShowcaseCtx): Promise<WipeResult> {
	const all = await ctx.ledger.list();
	const result: WipeResult = { removed: new Map(), failures: [], unknownKinds: [], pending: [] };

	result.pending = all.filter((e) => e.kind === PENDING_KIND).map((e) => e.externalId);
	if (result.pending.length > 0) {
		ctx.log(
			`WARNING: ${result.pending.length} interrupted Circle create(s) have no ledger id (${result.pending.join(", ")}). Check Circle for orphans by hand.`,
		);
	}
	const known = new Set(WIPE_ORDER);
	result.unknownKinds = [
		...new Set(
			all.filter((e) => e.kind !== PENDING_KIND && !known.has(e.kind)).map((e) => e.kind),
		),
	];
	for (const kind of result.unknownKinds) {
		ctx.log(`ERROR: ledger has entries of unknown kind "${kind}"; they will NOT be wiped.`);
	}

	for (const step of WIPE_STEPS) {
		const entries = all.filter((e) => e.kind === step.kind);
		if (entries.length === 0) continue;
		ctx.log(`${ctx.dry ? "[dry] would wipe" : "Wiping"} ${step.kind} (${entries.length})`);
		if (ctx.dry) {
			result.removed.set(step.kind, entries.length);
			continue;
		}
		try {
			await step.run(ctx, entries);
		} catch (error) {
			result.failures.push(
				`${step.kind}: ${error instanceof Error ? error.message : String(error)}`,
			);
			ctx.log(`  FAILED ${step.kind}; its ledger entries are kept so you can re-run wipe.`);
			continue;
		}
		for (const e of entries) await ctx.ledger.remove(e.kind, e.externalId);
		result.removed.set(step.kind, entries.length);
	}
	return result;
}

if (typeof require !== "undefined" && require.main === module) {
	void (async () => {
		const { runCli } = await import("./bootstrap");
		await runCli("wipe", process.argv.slice(2));
	})().then(
		() => process.exit(0),
		(error) => {
			console.error(error instanceof Error ? error.message : error);
			process.exit(1);
		},
	);
}

export { parseFlags };
