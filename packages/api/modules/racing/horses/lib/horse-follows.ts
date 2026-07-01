import { db } from "@repo/database";

export interface FollowRef {
	organizationId: string;
	userId: string;
	horseId: string;
}

/** Idempotent: following an already-followed horse is a no-op. */
export async function followHorse(ref: FollowRef): Promise<void> {
	await db.horseFollow.upsert({
		where: { userId_horseId: { userId: ref.userId, horseId: ref.horseId } },
		create: { organizationId: ref.organizationId, userId: ref.userId, horseId: ref.horseId },
		update: {},
	});
}

/** Idempotent: unfollowing a not-followed horse is a no-op. */
export async function unfollowHorse(ref: FollowRef): Promise<void> {
	await db.horseFollow.deleteMany({
		where: { userId: ref.userId, horseId: ref.horseId, organizationId: ref.organizationId },
	});
}

/** Add every org member as a follower of a horse. Idempotent (skips existing). */
export async function followAllMembers(params: { organizationId: string; horseId: string }): Promise<{ added: number }> {
	const members = await db.member.findMany({ where: { organizationId: params.organizationId }, select: { userId: true } });
	if (members.length === 0) return { added: 0 };
	const result = await db.horseFollow.createMany({
		data: members.map((m) => ({ organizationId: params.organizationId, userId: m.userId, horseId: params.horseId })),
		skipDuplicates: true,
	});
	return { added: result.count };
}
