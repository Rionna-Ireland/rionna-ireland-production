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
 * into every admin-chosen `autoJoin` space.
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
 * @see Architecture/specs/S12-02-member-posting-filters-moderation.md §10
 */

import { db, parseOrgMetadata } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";

import { fetchMemberSpaces } from "./member-spaces";
import { listAutoJoinSpaceIds } from "./space-settings";

/**
 * Safety cap on members processed per cron run, matching the bounded design
 * of the horse-follow reconcile pass (`reconcile-space-memberships.ts`) — at
 * single-club scale this comfortably covers the whole member base in one
 * run, but a stuck cron shouldn't be able to hammer Circle unboundedly.
 */
const MAX_MEMBERS_PER_RUN = 200;

export interface ReconcileAutoJoinSummary {
	/** Orgs with a Circle community configured and at least one autoJoin space. */
	orgs: number;
	/** Active, provisioned members considered across all orgs (post-cap). */
	members: number;
	/** Member × autoJoin-space pairs where the member was joined this run. */
	joined: number;
	/** Member × autoJoin-space pairs skipped because the member was already a member. */
	skipped: number;
	/** Member × autoJoin-space pairs (or whole members) that failed — logged, never fatal. */
	errors: number;
}

export async function reconcileAutoJoinMemberships(): Promise<ReconcileAutoJoinSummary> {
	const orgs = await db.organization.findMany({ select: { id: true, slug: true, metadata: true } });

	let orgsProcessed = 0;
	let members = 0;
	let joined = 0;
	let skipped = 0;
	let errors = 0;

	for (const org of orgs) {
		const metadata = parseOrgMetadata(org.metadata);
		if (!metadata.circle?.communityDomain && !metadata.circle?.communityId) {
			continue;
		}

		const autoJoinSpaceIds = listAutoJoinSpaceIds(metadata);
		if (autoJoinSpaceIds.length === 0) {
			continue;
		}

		if (!org.slug) {
			logger.warn("[Circle] Auto-join reconcile: org has no slug, cannot build Circle service", {
				surface: "community.auto_join_reconcile",
				organizationId: org.id,
			});
			continue;
		}

		orgsProcessed++;

		// Same "active, provisioned" filter as reconcileCircleMembers's stale-active
		// query in reconciliation.ts.
		const activeMembers = await db.member.findMany({
			where: { organizationId: org.id, circleMemberId: { not: null }, circleStatus: "active" },
			select: { id: true, circleMemberId: true, user: { select: { email: true } } },
		});

		let candidates = activeMembers;
		if (activeMembers.length > MAX_MEMBERS_PER_RUN) {
			candidates = activeMembers.slice(0, MAX_MEMBERS_PER_RUN);
			logger.warn("community.auto_join.member_cap_hit", {
				surface: "community.auto_join_reconcile",
				organizationId: org.id,
				totalActiveMembers: activeMembers.length,
				cap: MAX_MEMBERS_PER_RUN,
			});
		}

		const circle = createCircleService(org.slug);

		for (const member of candidates) {
			members++;
			const email = member.user?.email;
			if (!member.circleMemberId || !email) {
				skipped += autoJoinSpaceIds.length;
				continue;
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
					continue;
				}

				const spaces = await fetchMemberSpaces({ accessToken: token.data.accessToken });
				if (!spaces) {
					errors += autoJoinSpaceIds.length;
					logger.warn("community.auto_join.spaces_fetch_failed", {
						surface: "community.auto_join_reconcile",
						organizationId: org.id,
						memberId: member.id,
					});
					continue;
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
		}
	}

	const summary: ReconcileAutoJoinSummary = {
		orgs: orgsProcessed,
		members,
		joined,
		skipped,
		errors,
	};

	logger.info("[Circle] Auto-join reconcile summary", {
		surface: "community.auto_join_reconcile",
		...summary,
	});

	return summary;
}
