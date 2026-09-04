import { ORPCError } from "@orpc/client";
import { db, listModerationFlags } from "@repo/database";
import type { ModerationFlagType, ModerationSource, ModerationStatus } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export type ModerationFlagRow = ModerationFlagType & {
	memberName: string | null;
	memberEmail: string | null;
};

export interface ListModerationResult {
	rows: ModerationFlagRow[];
	nextCursor: string | null;
}

/** Pure, unit-testable core. Batch-loads member name/email in one query. */
export async function runListModeration(p: {
	organizationId: string;
	source: ModerationSource;
	status?: ModerationStatus;
	cursor?: string;
}): Promise<ListModerationResult> {
	const { rows, nextCursor } = await listModerationFlags(p);

	const memberIds = [...new Set(rows.map((r) => r.memberId))];
	const members = memberIds.length
		? await db.member.findMany({
				where: { id: { in: memberIds } },
				select: { id: true, user: { select: { name: true, email: true } } },
			})
		: [];
	const memberById = new Map(members.map((m) => [m.id, m]));

	return {
		rows: rows.map((row) => ({
			...row,
			memberName: memberById.get(row.memberId)?.user.name ?? null,
			memberEmail: memberById.get(row.memberId)?.user.email ?? null,
		})),
		nextCursor,
	};
}

export const listModeration = adminProcedure
	.route({
		method: "GET",
		path: "/admin/community/moderation",
		tags: ["Community"],
		summary: "List moderation flags (reports + blocks)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			source: z.enum(["blocked", "reported"]),
			status: z.enum(["open", "deleted", "dismissed"]).optional(),
			cursor: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }): Promise<ListModerationResult> => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		return runListModeration(input);
	});
