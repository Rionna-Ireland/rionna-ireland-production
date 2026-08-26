import { db } from "../client";
import type { Prisma } from "../generated/client";

const authorSelect = { select: { id: true, name: true, image: true } } as const;
const horseSelect = {
	select: { id: true, name: true, slug: true, circleSpaceId: true },
} as const;

export async function createMemberPost(data: {
	organizationId: string;
	authorUserId?: string | null;
	audienceType: string;
	horseId?: string | null;
	updateType?: string | null;
	title: string;
	bodyJson?: Prisma.InputJsonValue;
	bodyHtml?: string | null;
	videoUrl?: string | null;
}) {
	return await db.memberPost.create({
		data,
		include: { author: authorSelect, horse: horseSelect },
	});
}

export async function updateMemberPost(
	id: string,
	data: {
		audienceType?: string;
		horseId?: string | null;
		updateType?: string | null;
		title?: string;
		bodyJson?: Prisma.InputJsonValue;
		bodyHtml?: string | null;
		videoUrl?: string | null;
		status?: string;
		circleSpaceId?: string | null;
		circlePostId?: string | null;
		publishedAt?: Date | null;
		publishError?: string | null;
	},
) {
	return await db.memberPost.update({
		where: { id },
		data,
		include: { author: authorSelect, horse: horseSelect },
	});
}

export async function getMemberPostById(id: string) {
	return await db.memberPost.findUnique({
		where: { id },
		include: { author: authorSelect, horse: horseSelect },
	});
}

export async function getMemberPosts({
	organizationId,
	status,
	horseId,
	audienceType,
	limit,
	offset,
}: {
	organizationId: string;
	status?: string;
	horseId?: string;
	audienceType?: string;
	limit: number;
	offset: number;
}) {
	return await db.memberPost.findMany({
		where: {
			organizationId,
			...(status ? { status } : {}),
			...(horseId ? { horseId } : {}),
			...(audienceType ? { audienceType } : {}),
		},
		include: { author: authorSelect, horse: horseSelect },
		orderBy: { createdAt: "desc" },
		take: limit,
		skip: offset,
	});
}

export async function deleteMemberPost(id: string) {
	return await db.memberPost.delete({ where: { id } });
}

/** Member-facing horse updates — published only, newest first (S8-01a2). */
export async function listPublishedHorseUpdates(params: {
	organizationId: string;
	horseId: string;
}) {
	return await db.memberPost.findMany({
		where: {
			organizationId: params.organizationId,
			horseId: params.horseId,
			audienceType: "horse",
			status: "published",
		},
		select: {
			id: true,
			updateType: true,
			title: true,
			bodyJson: true,
			publishedAt: true,
			circlePostId: true,
		},
		orderBy: { publishedAt: "desc" },
	});
}

/**
 * Latest published trainer-type horse updates, org-wide, for published
 * horses only (S8-07) — feeds the Pulse "Trainer Updates" tile.
 *
 * `horseWhere` (S9-05) restricts which horses' updates are eligible — pass
 * the caller's `getAccessibleHorseWhere(...)` result so an invite-only
 * horse's trainer updates never surface to a member who doesn't follow it.
 */
export async function listLatestTrainerUpdates(params: {
	organizationId: string;
	limit: number;
	horseWhere?: Prisma.HorseWhereInput;
}) {
	return await db.memberPost.findMany({
		where: {
			organizationId: params.organizationId,
			audienceType: "horse",
			updateType: "trainer",
			status: "published",
			horse: { publishedAt: { not: null }, ...(params.horseWhere ?? {}) },
		},
		select: {
			id: true,
			title: true,
			bodyJson: true,
			publishedAt: true,
			horseId: true,
			horse: { select: { id: true, name: true } },
		},
		orderBy: { publishedAt: "desc" },
		take: params.limit,
	});
}
