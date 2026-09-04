import { db } from "../client";
import { Prisma } from "../generated/client";

export type ModerationSource = "blocked" | "reported";
export type ModerationSurface = "post" | "comment";
export type ModerationStatus = "open" | "deleted" | "dismissed";

/** Returns null when the partial unique index rejects a duplicate report (P2002). */
export async function createModerationFlag(data: Prisma.ModerationFlagUncheckedCreateInput) {
	try {
		return await db.moderationFlag.create({ data });
	} catch (error) {
		if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
		throw error;
	}
}

export async function listModerationFlags(p: {
	organizationId: string;
	source: ModerationSource;
	status?: ModerationStatus;
	take?: number;
	cursor?: string;
}) {
	const take = Math.min(p.take ?? 50, 100);
	const rows = await db.moderationFlag.findMany({
		where: { organizationId: p.organizationId, source: p.source, ...(p.status ? { status: p.status } : {}) },
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
