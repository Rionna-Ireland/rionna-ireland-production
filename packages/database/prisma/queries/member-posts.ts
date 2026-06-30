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
