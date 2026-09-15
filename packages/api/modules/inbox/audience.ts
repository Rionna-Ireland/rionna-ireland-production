import { db } from "@repo/database";

import { resolveHorseFollowerUserIds } from "../push/horse-follower-filter";

export type InboxAudience =
	| { kind: "org" }
	| { kind: "horseFollowers"; horseId: string }
	| { kind: "user"; userId: string };

/**
 * Member-based audience (not token-based like push): members with push off
 * or no device still get inbox rows (spec decision 2).
 */
export async function resolveInboxUserIds(
	organizationId: string,
	audience: InboxAudience,
	excludeUserId?: string | null,
): Promise<string[]> {
	if (audience.kind === "user") {
		return audience.userId === excludeUserId ? [] : [audience.userId];
	}

	const members = await db.member.findMany({
		where: { organizationId },
		select: { userId: true },
	});
	let userIds = members.map((m) => m.userId);

	if (audience.kind === "horseFollowers") {
		const followers = await resolveHorseFollowerUserIds(organizationId, audience.horseId);
		if (followers) userIds = userIds.filter((id) => followers.has(id));
	}

	return excludeUserId ? userIds.filter((id) => id !== excludeUserId) : userIds;
}
