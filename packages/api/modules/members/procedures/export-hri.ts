import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { CURRENT_TERMS_VERSION, type CsvColumn, toCsv } from "@repo/utils";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { formatDublinDate, formatDublinIso } from "../lib/dublin-time";
import {
	CURRENT_MEMBER_STATUSES,
	groupStatusesByUser,
	pickSubscriptionStatus,
} from "../lib/subscription-status";

interface HriRow {
	name: string;
	email: string;
	termsVersion: string | null;
	termsAcceptedAt: Date | null;
}

/** True when the member's latest recorded acceptance is of the current terms. */
function hasAcceptedCurrentTerms(row: HriRow): boolean {
	return row.termsVersion === CURRENT_TERMS_VERSION;
}

/**
 * HRI export columns (S12-10 B1). PLACEHOLDER set until HRI sends its field
 * list — each column is one line here, so swapping them is a local change.
 */
const HRI_COLUMNS: CsvColumn<HriRow>[] = [
	{ header: "name", value: (row) => row.name },
	{ header: "email", value: (row) => row.email },
	{ header: "terms_accepted", value: (row) => (hasAcceptedCurrentTerms(row) ? "yes" : "no") },
	{ header: "terms_version", value: (row) => row.termsVersion },
	{
		header: "terms_accepted_at",
		value: (row) => (row.termsAcceptedAt ? formatDublinIso(row.termsAcceptedAt) : null),
	},
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
			db.legalAcceptance.findMany({
				where: { organizationId, document: "terms", userId: { in: userIds } },
				select: { userId: true, version: true, acceptedAt: true },
				orderBy: { acceptedAt: "desc" },
			}),
		]);

		const statusesByUser = groupStatusesByUser(purchases);

		// Rows arrive newest-first, so the first one seen per user is the latest.
		const latestAcceptance = new Map<string, { version: string; acceptedAt: Date }>();
		for (const acceptance of acceptances) {
			if (!latestAcceptance.has(acceptance.userId)) {
				latestAcceptance.set(acceptance.userId, acceptance);
			}
		}

		const rows: HriRow[] = members
			.filter((member) => {
				if (scope === "all") return true;
				const status = pickSubscriptionStatus(statusesByUser.get(member.userId) ?? []);
				return CURRENT_MEMBER_STATUSES.includes(status);
			})
			.map((member) => {
				const acceptance = latestAcceptance.get(member.userId);
				return {
					name: member.user.name,
					email: member.user.email,
					termsVersion: acceptance?.version ?? null,
					termsAcceptedAt: acceptance?.acceptedAt ?? null,
				};
			});

		const notAcceptedCount = rows.filter((row) => !hasAcceptedCurrentTerms(row)).length;

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
