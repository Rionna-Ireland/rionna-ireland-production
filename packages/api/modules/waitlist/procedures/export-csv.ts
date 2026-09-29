import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { type CsvColumn, toCsv } from "@repo/utils";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { formatDublinDate, formatDublinIso } from "../../members/lib/dublin-time";

interface WaitlistCsvRow {
	firstName: string;
	lastName: string;
	email: string;
	source: string | null;
	consentedAt: Date;
}

const WAITLIST_COLUMNS: CsvColumn<WaitlistCsvRow>[] = [
	{ header: "first_name", value: (row) => row.firstName },
	{ header: "last_name", value: (row) => row.lastName },
	{ header: "email", value: (row) => row.email },
	{ header: "source", value: (row) => row.source },
	{ header: "consented_at", value: (row) => formatDublinIso(row.consentedAt) },
];

/**
 * S12-09 §6: CSV of subscribed waitlist rows (unsubscribed people are never
 * exported). Names are user-supplied, so `toCsv`'s formula guard matters.
 */
export const exportWaitlistCsv = adminProcedure
	.route({
		method: "POST",
		path: "/admin/waitlist/export",
		tags: ["Waitlist"],
		summary: "Export subscribed waitlist signups as CSV",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input: { organizationId }, context }) => {
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const rows = await db.waitlistSignup.findMany({
			where: { organizationId, status: "subscribed" },
			select: {
				firstName: true,
				lastName: true,
				email: true,
				source: true,
				consentedAt: true,
			},
			orderBy: { consentedAt: "asc" },
		});

		logger.info("Admin exported waitlist", {
			event: "admin_waitlist_exported",
			actorUserId: context.user.id,
			organizationId,
			rowCount: rows.length,
		});

		return {
			filename: `rionna-waitlist-${formatDublinDate(new Date())}.csv`,
			csv: toCsv(WAITLIST_COLUMNS, rows),
			rowCount: rows.length,
		};
	});
