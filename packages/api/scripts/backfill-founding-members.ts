/**
 * One-off backfill (S13-12): flag existing paying members as founding members.
 *
 * Walks each organization's members in `createdAt` order and flags every
 * non-staff member holding a current subscription (active / trialing /
 * past_due) until the org has FOUNDING_MEMBER_CAP (25) flagged non-staff
 * members. Existing flags count toward the cap and are never cleared, so
 * reruns are idempotent and admin toggles are respected.
 *
 * Each flag goes through `assignFoundingMemberInTx`, i.e. the same advisory
 * lock + cap check as the live webhook path.
 *
 * Run per env:
 *   cd packages/api
 *   pnpm backfill:founding-members -- --dry-run              # local
 *   pnpm backfill:founding-members:staging -- --dry-run
 *   pnpm backfill:founding-members:production -- --dry-run
 *
 * DO NOT run against staging/production without explicit sign-off.
 * Pass --dry-run to report who would be flagged without writing.
 */

import { db } from "@repo/database";
import {
	assignFoundingMemberInTx,
	FOUNDING_MEMBER_CAP,
	NON_STAFF_MEMBER_WHERE,
} from "@repo/payments/lib/founding-member";
import { ACTIVE_SUBSCRIPTION_STATUSES } from "@repo/payments/lib/helper";

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
	const orgs = await db.organization.findMany({ select: { id: true, slug: true } });
	const summary = { orgs: orgs.length, flagged: 0, alreadyFlagged: 0, capReached: 0 };

	for (const org of orgs) {
		let flaggedCount = await db.member.count({
			where: { organizationId: org.id, foundingMember: true, ...NON_STAFF_MEMBER_WHERE },
		});

		const candidates = await db.member.findMany({
			where: {
				organizationId: org.id,
				...NON_STAFF_MEMBER_WHERE,
				user: {
					...NON_STAFF_MEMBER_WHERE.user,
					purchases: {
						some: {
							organizationId: org.id,
							type: "SUBSCRIPTION",
							status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
						},
					},
				},
			},
			orderBy: { createdAt: "asc" },
			select: { id: true, foundingMember: true, createdAt: true, user: { select: { email: true } } },
		});

		for (const member of candidates) {
			if (member.foundingMember) {
				summary.alreadyFlagged++;
				continue;
			}
			if (flaggedCount >= FOUNDING_MEMBER_CAP) {
				summary.capReached++;
				continue;
			}

			if (DRY_RUN) {
				console.log(`[dry-run] would flag ${org.slug} ${member.user.email} (${member.createdAt.toISOString()})`);
				flaggedCount++;
				summary.flagged++;
				continue;
			}

			const result = await db.$transaction((tx) => assignFoundingMemberInTx(tx, member.id));
			if (result === "assigned") {
				flaggedCount++;
				summary.flagged++;
				console.log(`flagged ${org.slug} ${member.user.email}`);
			} else if (result === "cap_reached") {
				summary.capReached++;
			}
		}
	}

	console.log(JSON.stringify({ dryRun: DRY_RUN, ...summary }));
}

void main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => db.$disconnect());
