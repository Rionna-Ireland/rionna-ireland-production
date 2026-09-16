import { db } from "../client";
import type { Prisma } from "../generated/client";

export type ModerationSource = "blocked" | "reported" | "auto" | "attention";
export type ModerationSurface = "post" | "comment" | "member";
export type ModerationStatus = "open" | "deleted" | "dismissed";

/**
 * Prisma unique violation. Checked by `code`, not `instanceof`: Next bundles
 * @repo/database (transpilePackages), so the bundled `Prisma` error class is a
 * different object from the one the runtime throws and `instanceof` is false.
 */
function isUniqueViolation(error: unknown): boolean {
	return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/**
 * Returns null when a partial unique index rejects the insert (P2002): a
 * duplicate report, or an already-open attention item (S12-08).
 */
export async function createModerationFlag(data: Prisma.ModerationFlagUncheckedCreateInput) {
	try {
		return await db.moderationFlag.create({ data });
	} catch (error) {
		if (isUniqueViolation(error)) return null;
		throw error;
	}
}

export async function listModerationFlags(p: {
	organizationId: string;
	source: ModerationSource | ModerationSource[];
	status?: ModerationStatus;
	take?: number;
	cursor?: string;
}) {
	const take = Math.min(p.take ?? 50, 100);
	const source = Array.isArray(p.source) ? { in: p.source } : p.source;
	const rows = await db.moderationFlag.findMany({
		where: { organizationId: p.organizationId, source, ...(p.status ? { status: p.status } : {}) },
		orderBy: { createdAt: "desc" },
		take: take + 1,
		...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
	});
	const nextCursor = rows.length > take ? (rows.pop()?.id ?? null) : null;
	return { rows, nextCursor };
}

export async function resolveModerationFlag(p: {
	id: string;
	organizationId: string;
	status: "deleted" | "dismissed";
	resolvedByUserId: string;
}) {
	const { count } = await db.moderationFlag.updateMany({
		where: { id: p.id, organizationId: p.organizationId, status: "open" },
		data: { status: p.status, resolvedAt: new Date(), resolvedByUserId: p.resolvedByUserId },
	});
	return count === 1 ? db.moderationFlag.findUnique({ where: { id: p.id } }) : null;
}

/** S12-08: blocks (word gate + auto) by one member since `since`. */
export async function countMemberBlocksSince(p: { organizationId: string; memberId: string; since: Date }) {
	return db.moderationFlag.count({
		where: {
			organizationId: p.organizationId,
			memberId: p.memberId,
			source: { in: ["blocked", "auto"] },
			createdAt: { gte: p.since },
		},
	});
}

/** S12-08: the member's most recently dismissed attention item (resets the escalation window). */
export async function findLastDismissedAttention(p: { organizationId: string; memberId: string }) {
	return db.moderationFlag.findFirst({
		where: { organizationId: p.organizationId, memberId: p.memberId, source: "attention", status: "dismissed" },
		orderBy: { resolvedAt: "desc" },
		select: { resolvedAt: true },
	});
}

/** S12-08: the member's blocks since `since`, newest first (attention tab detail). */
export async function listMemberBlocksSince(p: { organizationId: string; memberId: string; since: Date; take?: number }) {
	return db.moderationFlag.findMany({
		where: {
			organizationId: p.organizationId,
			memberId: p.memberId,
			source: { in: ["blocked", "auto"] },
			createdAt: { gte: p.since },
		},
		orderBy: { createdAt: "desc" },
		take: Math.min(p.take ?? 20, 50),
	});
}
