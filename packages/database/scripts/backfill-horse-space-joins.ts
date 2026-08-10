/**
 * One-off backfill (S8-04 §1): join every existing HorseFollow into its
 * horse's Circle space.
 *
 * S8-03's join-on-follow only fires on follow/unfollow *events* going
 * forward — HorseFollow rows created before it shipped (and the S6-07
 * auto-follow rows created before joins were wired in) never joined their
 * member to the horse's Circle space. This script closes that gap once per
 * environment.
 *
 * Scope: HorseFollow rows joined to a Member with a `circleMemberId` and a
 * Horse with an active `circleSpaceId` (`circleSpaceStatus === "active"`).
 * Rows that don't meet that join are counted as `skipped`, not attempted —
 * they have nothing to join yet (member not Circle-provisioned, or horse has
 * no active space).
 *
 * Respects the S8-04 §5 kill-switch (`OrganizationMetadata.features.horseFollows`):
 * an org with the flag set to `false` is skipped entirely (logged), matching
 * "don't churn Circle memberships for a feature that's off."
 *
 * `syncCircleSpaceMembership` joins are idempotent — an already-joined
 * member is treated as fine by the helper (never-throw, non-2xx = warn only)
 * — so reruns are safe.
 *
 * Run per env (mirrors the seed script / backfix-enable-post-likes pattern):
 *   cd packages/database
 *   pnpm exec dotenv -e ../../.env         -- pnpm exec tsx scripts/backfill-horse-space-joins.ts          # local/dev tokens
 *   pnpm exec dotenv -e ../../.env.staging -- pnpm exec tsx scripts/backfill-horse-space-joins.ts
 *   pnpm exec dotenv -e ../../.env.production -- pnpm exec tsx scripts/backfill-horse-space-joins.ts
 *
 * DO NOT run this against staging or production without explicit sign-off —
 * see the S8-04 spec's "Done when" checklist for the manual staging QA gate
 * this backfill feeds into.
 *
 * Top-level await needs a `main()` wrapper under this repo's tsx/CJS config
 * (see `prisma/seed.ts` for the same pattern).
 */

// @repo/payments is added as a devDependency (script-only use — the package
// export itself has no runtime dependency on @repo/payments) so this script
// can reuse the real syncCircleSpaceMembership helper instead of
// reimplementing the join call.
import { syncCircleSpaceMembership } from "@repo/payments/lib/circle-space-membership";

import { db } from "../prisma/client";
import { parseOrgMetadata } from "../types/organization-metadata";

const CONCURRENCY = 5;

interface Candidate {
	userId: string;
	horseId: string;
	organizationId: string;
}

interface Summary {
	total: number;
	joined: number;
	skipped: number;
	failed: number;
}

/** Bounded-concurrency runner (mirrors packages/api/modules/circle/lib/run-bounded.ts). */
async function runBounded<T>(limit: number, tasks: Array<() => Promise<T>>): Promise<void> {
	if (tasks.length === 0) return;
	const effectiveLimit = Math.max(1, Math.min(limit, tasks.length));
	let index = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const i = index++;
			if (i >= tasks.length) return;
			await tasks[i]();
		}
	};
	await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
}

async function main(): Promise<void> {
	const orgs = await db.organization.findMany({ select: { id: true, metadata: true, slug: true } });

	const candidates: Candidate[] = [];
	let skipped = 0;

	for (const org of orgs) {
		const metadata = parseOrgMetadata(org.metadata);
		if (metadata.features?.horseFollows === false) {
			console.log(`org ${org.id} (${org.slug ?? "no-slug"}): horseFollows disabled — skipping entirely`);
			continue;
		}

		const follows = await db.horseFollow.findMany({
			where: { organizationId: org.id },
			select: { userId: true, horseId: true, organizationId: true },
		});
		if (follows.length === 0) continue;

		// HorseFollow has no direct relation to Member (only to User) — Member
		// is looked up separately, keyed on the (organizationId, userId) unique.
		const userIds = [...new Set(follows.map((f) => f.userId))];
		const horseIds = [...new Set(follows.map((f) => f.horseId))];

		const members = await db.member.findMany({
			where: { organizationId: org.id, userId: { in: userIds } },
			select: { userId: true, circleMemberId: true },
		});
		const circleMemberIdByUserId = new Map(members.map((m) => [m.userId, m.circleMemberId]));

		const horses = await db.horse.findMany({
			where: { organizationId: org.id, id: { in: horseIds } },
			select: { id: true, circleSpaceId: true, circleSpaceStatus: true },
		});
		const horseById = new Map(horses.map((h) => [h.id, h]));

		for (const follow of follows) {
			const hasMember = Boolean(circleMemberIdByUserId.get(follow.userId));
			const horse = horseById.get(follow.horseId);
			const hasActiveSpace = Boolean(horse?.circleSpaceId) && horse?.circleSpaceStatus === "active";
			if (!hasMember || !hasActiveSpace) {
				skipped++;
				continue;
			}
			candidates.push({ userId: follow.userId, horseId: follow.horseId, organizationId: follow.organizationId });
		}
	}

	const failedPairs: Array<{ userId: string; horseId: string; organizationId: string }> = [];
	let joined = 0;

	await runBounded(
		CONCURRENCY,
		candidates.map((candidate) => async () => {
			try {
				const outcome = await syncCircleSpaceMembership({
					organizationId: candidate.organizationId,
					userId: candidate.userId,
					horseId: candidate.horseId,
					action: "join",
				});
				if (outcome.ok) {
					joined++;
				} else {
					failedPairs.push(candidate);
				}
			} catch (error) {
				failedPairs.push(candidate);
				console.warn(
					`join threw for userId=${candidate.userId} horseId=${candidate.horseId}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}),
	);

	const summary: Summary = {
		total: candidates.length + skipped,
		joined,
		skipped,
		failed: failedPairs.length,
	};

	console.log(JSON.stringify(summary));
	if (failedPairs.length > 0) {
		console.log("failed pairs (rerun is targeted — these are safe to retry):");
		for (const pair of failedPairs) {
			console.log(`  userId=${pair.userId} horseId=${pair.horseId} organizationId=${pair.organizationId}`);
		}
		process.exitCode = 1;
	}
}

void main();
