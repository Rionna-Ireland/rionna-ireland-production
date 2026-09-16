import { ORPCError } from "@orpc/client";
import { db, findLastDismissedAttention, listMemberBlocksSince, listModerationFlags } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { escalationWindowStart } from "../../../moderation/escalate-member";

export interface AttentionBlock {
	id: string;
	source: "blocked" | "auto";
	surface: string;
	contentExcerpt: string;
	matchedTerms: string[];
	createdAt: Date;
}

export interface AttentionRow {
	id: string;
	memberId: string;
	memberName: string | null;
	memberEmail: string | null;
	createdAt: Date;
	blocks: AttentionBlock[];
}

export interface ListAttentionResult {
	rows: AttentionRow[];
	nextCursor: string | null;
}

/** Pure, unit-testable core. Open "member needs attention" items (S12-08). */
export async function runListModerationAttention(p: { organizationId: string; cursor?: string }): Promise<ListAttentionResult> {
	const { rows, nextCursor } = await listModerationFlags({
		organizationId: p.organizationId,
		source: "attention",
		status: "open",
		cursor: p.cursor,
	});

	const memberIds = [...new Set(rows.map((r) => r.memberId))];
	const members = memberIds.length
		? await db.member.findMany({
				where: { id: { in: memberIds } },
				select: { id: true, user: { select: { name: true, email: true } } },
			})
		: [];
	const memberById = new Map(members.map((m) => [m.id, m]));

	const out: AttentionRow[] = [];
	for (const row of rows) {
		const lastDismissed = await findLastDismissedAttention({ organizationId: p.organizationId, memberId: row.memberId });
		const since = escalationWindowStart(row.createdAt, lastDismissed?.resolvedAt ?? null);
		const blocks = await listMemberBlocksSince({ organizationId: p.organizationId, memberId: row.memberId, since });

		out.push({
			id: row.id,
			memberId: row.memberId,
			memberName: memberById.get(row.memberId)?.user.name ?? null,
			memberEmail: memberById.get(row.memberId)?.user.email ?? null,
			createdAt: row.createdAt,
			blocks: blocks.map((b) => ({
				id: b.id,
				source: b.source as "blocked" | "auto",
				surface: b.surface,
				contentExcerpt: b.contentExcerpt,
				matchedTerms: b.matchedTerms,
				createdAt: b.createdAt,
			})),
		});
	}

	return { rows: out, nextCursor };
}

export const listModerationAttention = adminProcedure
	.route({
		method: "GET",
		path: "/admin/community/moderation/attention",
		tags: ["Community"],
		summary: "List members needing moderation attention",
	})
	.input(z.object({ organizationId: z.string(), cursor: z.string().optional() }))
	.handler(async ({ input, context }): Promise<ListAttentionResult> => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		return runListModerationAttention(input);
	});
