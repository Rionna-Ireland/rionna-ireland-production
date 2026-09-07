/**
 * Auto-join membership reconciliation (S12-02b Task 6, spec §10).
 *
 * Nothing joins members into the general Circle spaces on its own — the
 * hot-path (`provisionCircleMember` in `@repo/payments`) and the daily
 * reconciliation sweep (`reconcileCircleMembers`) only pass `spaceIds` at
 * *creation* time, so a member provisioned before an admin turned on
 * `autoJoin` for a space (or added a new autoJoin space afterwards) is
 * never joined. This pass closes that gap: for every org with a Circle
 * community configured, every active, provisioned member is re-asserted
 * into every admin-chosen `autoJoin` space that also passes the
 * private/horse safety guard (`resolveAutoJoinSpaceIds` — final review I1).
 *
 * Mirrors `reconcileSpaceMemberships` (the horse-follow pass) in shape:
 * per-org, per-member independence (one failure never blocks another),
 * bounded per run, and Circle's own "already a member" response is a
 * success — `addSpaceMember` is idempotent from the caller's perspective
 * (real.ts/mock.ts return `ok:true` for a 2xx even when the member was
 * already in the space), so joining an already-joined space is a no-op we
 * happily re-assert.
 *
 * Membership is checked with a member-token `fetchMemberSpaces` call (one
 * mint per member, like the composer's join-on-post path in
 * `create-post.ts`) rather than assumed from `addSpaceMember`'s response,
 * so a member already in the space is counted as `skipped` and never makes
 * an Admin v2 write.
 *
 * That check is best-effort, not a lock — a member can join a space between
 * the `fetchMemberSpaces` read and the `addSpaceMember` write (self-join on
 * first post, a concurrent reconcile tick, …). Circle's Admin v2 rejects a
 * duplicate join with a 4xx ("already a member"), which `real.ts`/`mock.ts`
 * classify as `{ ok: false, reason: "invalid_input" }` — that outcome is
 * counted as `skipped` here (not `errors`), since it means the member is
 * already where we wanted them. Any other failure reason is a real error.
 *
 * Members within an org are processed with bounded concurrency (final
 * review I2) — serial processing shares the horse-follow pass's cron
 * `maxDuration` budget and was likely to be killed mid-sweep on the first
 * run. A wall-clock time budget (`AUTO_JOIN_TIME_BUDGET_MS`, measured from
 * the start of the whole sweep) stops scheduling new work once exceeded,
 * logs `community.auto_join.truncated`, and reports `truncated: true` so
 * ops can tell a partial run apart from a complete one.
 *
 * The per-run member cap has no ordering guarantee against a stable cursor
 * (final review I3): members are ordered by `id` ascending and a
 * `circle.autoJoinCursor` (last processed member id) is persisted in org
 * metadata after each run, so the next run picks up where this one left
 * off instead of re-processing the same members forever. When fewer than
 * the cap remain after the cursor, the run wraps back to the start of the
 * ordering to fill out the batch; the cursor is cleared once a run's batch
 * has wrapped all the way back around to (or past) where it started,
 * marking a completed full pass over the org's active members.
 *
 * @see Architecture/specs/S12-02-member-posting-filters-moderation.md §10
 */

import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";

import { runBounded } from "../../circle/lib/run-bounded";
import { getHorseSpaceIds } from "./horse-space-ids";
import { fetchMemberSpaces } from "./member-spaces";
import { resolveAutoJoinSpaceIds } from "./resolve-auto-join-space-ids";

/**
 * Safety cap on members processed per cron run, matching the bounded design
 * of the horse-follow reconcile pass (`reconcile-space-memberships.ts`) — at
 * single-club scale this comfortably covers the whole member base in one
 * run, but a stuck cron shouldn't be able to hammer Circle unboundedly.
 */
const MAX_MEMBERS_PER_RUN = 200;

/** Members processed concurrently within an org (final review I2). */
const CONCURRENCY = 4;

/**
 * Wall-clock budget for the whole sweep, measured from the start of
 * `reconcileAutoJoinMemberships` (final review I2). Chosen comfortably under
 * the cron route's 300s `maxDuration`, leaving room for the horse-follow
 * pass that shares the same invocation.
 */
export const AUTO_JOIN_TIME_BUDGET_MS = 180_000;

export interface ReconcileAutoJoinSummary {
	/** Orgs with a Circle community configured and at least one safe autoJoin space. */
	orgs: number;
	/** Active, provisioned members considered across all orgs (post-cap). */
	members: number;
	/** Member × autoJoin-space pairs where the member was joined this run. */
	joined: number;
	/** Member × autoJoin-space pairs skipped because the member was already a member. */
	skipped: number;
	/** Member × autoJoin-space pairs (or whole members) that failed — logged, never fatal. */
	errors: number;
	/** True when the sweep stopped early because it hit `AUTO_JOIN_TIME_BUDGET_MS`. */
	truncated: boolean;
}

interface ActiveMemberRow {
	id: string;
	circleMemberId: string | null;
	user: { email: string | null } | null;
}

/**
 * Pick the members to process this run out of `activeMembers` (already
 * sorted by `id` ascending), honouring the persisted cursor and the
 * per-run cap, wrapping back to the start when fewer than the cap remain
 * after the cursor.
 *
 * Returns the candidate batch, the new cursor to persist (`undefined`
 * clears it — a full pass completed), and whether the cap was hit (for the
 * existing ops warning).
 */
function selectCandidates(
	activeMembers: ActiveMemberRow[],
	cursor: string | undefined,
): { candidates: ActiveMemberRow[]; nextCursor: string | undefined; capHit: boolean } {
	if (activeMembers.length <= MAX_MEMBERS_PER_RUN) {
		// Everyone fits in one run — always a complete pass, cursor cleared.
		return { candidates: activeMembers, nextCursor: undefined, capHit: false };
	}

	// findIndex returns -1 when every id is <= cursor (we've reached the end
	// of the ordering) — treat that as "nothing left after the cursor", which
	// forces a full wrap back to the start below.
	const startIdx = cursor
		? (() => {
				const i = activeMembers.findIndex((m) => m.id > cursor);
				return i === -1 ? activeMembers.length : i;
			})()
		: 0;

	const afterCursor = activeMembers.slice(startIdx, startIdx + MAX_MEMBERS_PER_RUN);
	// This run reached the literal end of the ordering — combined with
	// whatever earlier runs already covered from the start up to the old
	// cursor, that means every active member has now been touched at least
	// once since the cursor was last cleared: a full pass just completed.
	const reachedEnd = startIdx + afterCursor.length >= activeMembers.length;
	const remainingCap = MAX_MEMBERS_PER_RUN - afterCursor.length;

	// Only spend the leftover budget wrapping to the start once we've
	// actually reached the end — otherwise there's still unprocessed tail
	// left for a future run's cursor to pick up.
	const wrapped = reachedEnd && remainingCap > 0 ? activeMembers.slice(0, Math.min(remainingCap, startIdx)) : [];

	const candidates = afterCursor.concat(wrapped);
	const nextCursor = reachedEnd ? undefined : candidates[candidates.length - 1]?.id;

	return { candidates, nextCursor, capHit: true };
}

export async function reconcileAutoJoinMemberships(opts?: {
	now?: () => number;
}): Promise<ReconcileAutoJoinSummary> {
	const now = opts?.now ?? Date.now;
	const start = now();

	const orgs = await db.organization.findMany({ select: { id: true, slug: true, metadata: true } });

	let orgsProcessed = 0;
	let members = 0;
	let joined = 0;
	let skipped = 0;
	let errors = 0;
	let truncated = false;

	for (const org of orgs) {
		if (now() - start > AUTO_JOIN_TIME_BUDGET_MS) {
			truncated = true;
			logger.warn("community.auto_join.truncated", {
				surface: "community.auto_join_reconcile",
				organizationId: org.id,
				elapsedMs: now() - start,
				budgetMs: AUTO_JOIN_TIME_BUDGET_MS,
			});
			break;
		}

		const metadata = parseOrgMetadata(org.metadata);
		if (!metadata.circle?.communityDomain && !metadata.circle?.communityId) {
			continue;
		}

		if (!org.slug) {
			logger.warn("[Circle] Auto-join reconcile: org has no slug, cannot build Circle service", {
				surface: "community.auto_join_reconcile",
				organizationId: org.id,
			});
			continue;
		}

		const circle = createCircleService(org.slug);

		// Final review I1: don't trust metadata.circle.spaces[*].autoJoin alone
		// — resolve against Circle's own private-space flag and both horse
		// signals (Horse.circleSpaceId + spaceGroupId) before joining anyone.
		// One Admin v2 listing per org, same cost as `runListSpaces`.
		const [spacesResult, horseSpaceIds] = await Promise.all([
			circle.listSpaces(),
			getHorseSpaceIds(org.id),
		]);
		const adminSpaces = new Map(
			spacesResult.ok
				? spacesResult.data.map((s) => [
						s.id,
						{ isPrivate: s.isPrivate, spaceGroupId: s.spaceGroupId ?? null },
					])
				: [],
		);

		const autoJoinSpaceIds = resolveAutoJoinSpaceIds({ metadata, adminSpaces, horseSpaceIds });
		if (autoJoinSpaceIds.length === 0) {
			continue;
		}

		orgsProcessed++;

		// Same "active, provisioned" filter as reconcileCircleMembers's stale-active
		// query in reconciliation.ts.
		const activeMembers: ActiveMemberRow[] = await db.member.findMany({
			where: { organizationId: org.id, circleMemberId: { not: null }, circleStatus: "active" },
			select: { id: true, circleMemberId: true, user: { select: { email: true } } },
			orderBy: { id: "asc" },
		});
		activeMembers.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

		const cursor = metadata.circle?.autoJoinCursor;
		const { candidates, nextCursor, capHit } = selectCandidates(activeMembers, cursor);

		if (capHit) {
			logger.warn("community.auto_join.member_cap_hit", {
				surface: "community.auto_join_reconcile",
				organizationId: org.id,
				totalActiveMembers: activeMembers.length,
				cap: MAX_MEMBERS_PER_RUN,
			});
		}

		await runBounded(
			CONCURRENCY,
			candidates.map((member) => async () => {
				if (truncated) return;
				if (now() - start > AUTO_JOIN_TIME_BUDGET_MS) {
					truncated = true;
					logger.warn("community.auto_join.truncated", {
						surface: "community.auto_join_reconcile",
						organizationId: org.id,
						memberId: member.id,
						elapsedMs: now() - start,
						budgetMs: AUTO_JOIN_TIME_BUDGET_MS,
					});
					return;
				}

				members++;
				const email = member.user?.email;
				if (!member.circleMemberId || !email) {
					skipped += autoJoinSpaceIds.length;
					return;
				}

				try {
					const token = await circle.getMemberToken(member.circleMemberId);
					if (!token.ok) {
						errors += autoJoinSpaceIds.length;
						logger.warn("community.auto_join.token_failed", {
							surface: "community.auto_join_reconcile",
							organizationId: org.id,
							memberId: member.id,
							reason: token.reason,
						});
						return;
					}

					const spaces = await fetchMemberSpaces({ accessToken: token.data.accessToken });
					if (!spaces) {
						errors += autoJoinSpaceIds.length;
						logger.warn("community.auto_join.spaces_fetch_failed", {
							surface: "community.auto_join_reconcile",
							organizationId: org.id,
							memberId: member.id,
						});
						return;
					}
					const memberSpaceById = new Map(spaces.map((s) => [s.id, s]));

					for (const spaceId of autoJoinSpaceIds) {
						const memberSpace = memberSpaceById.get(spaceId);
						if (memberSpace?.isMember) {
							skipped++;
							continue;
						}

						try {
							const outcome = await circle.addSpaceMember({ spaceId, email });
							if (outcome.ok) {
								joined++;
							} else if (outcome.reason === "invalid_input") {
								// Likely an already-a-member race (see the module doc
								// comment above): the member joined between our
								// fetchMemberSpaces read and this write. Not an error —
								// the desired end-state (member is in the space) holds.
								skipped++;
								logger.info("community.auto_join.join_skipped_invalid_input", {
									surface: "community.auto_join_reconcile",
									organizationId: org.id,
									memberId: member.id,
									spaceId,
									reason: outcome.reason,
								});
							} else {
								errors++;
								logger.warn("community.auto_join.join_failed", {
									surface: "community.auto_join_reconcile",
									organizationId: org.id,
									memberId: member.id,
									spaceId,
									reason: outcome.reason,
								});
							}
						} catch (error) {
							errors++;
							logger.warn("community.auto_join.join_threw", {
								surface: "community.auto_join_reconcile",
								organizationId: org.id,
								memberId: member.id,
								spaceId,
								error: error instanceof Error ? error.message : String(error),
							});
						}
					}
				} catch (error) {
					errors += autoJoinSpaceIds.length;
					logger.warn("community.auto_join.member_threw", {
						surface: "community.auto_join_reconcile",
						organizationId: org.id,
						memberId: member.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}),
		);

		// Persist the cursor for this org, preserving whatever else changed in
		// metadata since the read above (e.g. an admin toggling a setting mid-run).
		if (nextCursor !== cursor) {
			const freshOrg = await db.organization.findUnique({
				where: { id: org.id },
				select: { metadata: true },
			});
			const freshMetadata = parseOrgMetadata(freshOrg?.metadata ?? null);
			await db.organization.update({
				where: { id: org.id },
				data: {
					metadata: JSON.stringify({
						...freshMetadata,
						circle: {
							...freshMetadata.circle,
							autoJoinCursor: nextCursor,
						},
					}),
				},
			});
		}
	}

	const summary: ReconcileAutoJoinSummary = {
		orgs: orgsProcessed,
		members,
		joined,
		skipped,
		errors,
		truncated,
	};

	logger.info("[Circle] Auto-join reconcile summary", {
		surface: "community.auto_join_reconcile",
		...summary,
	});

	return summary;
}
