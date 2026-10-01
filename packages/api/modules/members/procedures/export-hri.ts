import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import {
	CURRENT_AGE_CONFIRMATION_VERSION,
	CURRENT_TERMS_VERSION,
	type CsvColumn,
	toCsv,
} from "@repo/utils";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { AGE_CONFIRMATION_DOCUMENT, TERMS_DOCUMENT } from "../../legal/lib/terms";
import { formatDublinDate } from "../lib/dublin-time";
import {
	CURRENT_MEMBER_STATUSES,
	groupStatusesByUser,
	pickSubscriptionStatus,
} from "../lib/subscription-status";

interface HriRow {
	name: string;
	email: string;
	over18: boolean;
	termsAccepted: boolean;
}

const yesNo = (value: boolean) => (value ? "yes" : "no");

/**
 * HRI export columns (S12-10 B1): the field list HRI asked for — name, email,
 * whether the member confirmed they are 18+, and whether they accepted the
 * current terms.
 */
const HRI_COLUMNS: CsvColumn<HriRow>[] = [
	{ header: "name", value: (row) => row.name },
	{ header: "email", value: (row) => row.email },
	{ header: "over_18", value: (row) => yesNo(row.over18) },
	{ header: "terms_accepted", value: (row) => yesNo(row.termsAccepted) },
];

/**
 * S12-10 Part B: CSV of club members for Horse Racing Ireland. Tom downloads
 * it from `/admin/members` and forwards it (decision 7) — no scheduled email.
 *
 * Rows: `role = "member"` only (admins/owners excluded). `scope: "active"`
 * keeps active | trialing | past_due (decision 3). `joinedSince` gives a
 * "new since" delta on Member.createdAt (decision 2).
 *
 * @see Architecture/specs/S12-10-hri-member-export.md
 */
export const exportHri = adminProcedure
	.route({
		method: "POST",
		path: "/admin/members/export-hri",
		tags: ["Members"],
		summary: "Export club members as CSV for Horse Racing Ireland",
	})
	.input(
		z.object({
			organizationId: z.string(),
			scope: z.enum(["active", "all"]).default("active"),
			joinedSince: z.coerce.date().optional(),
		}),
	)
	.handler(async ({ input: { organizationId, scope, joinedSince }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const members = await db.member.findMany({
			where: {
				organizationId,
				role: "member",
				...(joinedSince ? { createdAt: { gte: joinedSince } } : {}),
			},
			include: { user: { select: { id: true, name: true, email: true } } },
			orderBy: { createdAt: "asc" },
		});
		const userIds = members.map((member) => member.userId);

		const [purchases, acceptances] = await Promise.all([
			db.purchase.findMany({
				where: { organizationId, userId: { in: userIds } },
				select: { userId: true, status: true },
			}),
			// Org-agnostic on purpose, like getAcceptedTermsVersion: a signup-time
			// acceptance may be recorded against the fallback club org, and userIds are
			// already scoped to this club's members.
			db.legalAcceptance.findMany({
				where: {
					document: { in: [TERMS_DOCUMENT, AGE_CONFIRMATION_DOCUMENT] },
					userId: { in: userIds },
				},
				select: { userId: true, document: true, version: true },
				orderBy: { acceptedAt: "desc" },
			}),
		]);

		const statusesByUser = groupStatusesByUser(purchases);

		// Rows arrive newest-first, so the first one seen per user and document is
		// the latest.
		const latestVersion = new Map<string, string>();
		for (const { userId, document, version } of acceptances) {
			const key = `${userId}:${document}`;
			if (!latestVersion.has(key)) {
				latestVersion.set(key, version);
			}
		}

		const rows: HriRow[] = members
			.filter((member) => {
				if (scope === "all") return true;
				const status = pickSubscriptionStatus(statusesByUser.get(member.userId) ?? []);
				return CURRENT_MEMBER_STATUSES.includes(status);
			})
			.map((member) => ({
				name: member.user.name,
				email: member.user.email,
				over18:
					latestVersion.get(`${member.userId}:${AGE_CONFIRMATION_DOCUMENT}`) ===
					CURRENT_AGE_CONFIRMATION_VERSION,
				termsAccepted:
					latestVersion.get(`${member.userId}:${TERMS_DOCUMENT}`) ===
					CURRENT_TERMS_VERSION,
			}));

		const notAcceptedCount = rows.filter((row) => !(row.over18 && row.termsAccepted)).length;

		logger.info("Admin exported HRI member list", {
			event: "admin_hri_export",
			actorUserId: context.user.id,
			organizationId,
			scope,
			joinedSince: joinedSince?.toISOString() ?? null,
			rowCount: rows.length,
			notAcceptedCount,
		});

		return {
			filename: `rionna-members-hri-${formatDublinDate(new Date())}.csv`,
			csv: toCsv(HRI_COLUMNS, rows),
			rowCount: rows.length,
			notAcceptedCount,
		};
	});
