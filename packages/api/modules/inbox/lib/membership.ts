import { db } from "@repo/database";

/** Isolation guard shared by the inbox mutation procedures. */
export async function isMember(userId: string, organizationId: string): Promise<boolean> {
	const member = await db.member.findUnique({
		where: { organizationId_userId: { organizationId, userId } },
		select: { id: true },
	});
	return Boolean(member);
}
