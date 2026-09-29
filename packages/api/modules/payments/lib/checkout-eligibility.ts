import { hasPendingInvitation } from "@repo/auth/lib/signup-guard";
import { db } from "@repo/database";
import { isPublicSignupOpen } from "@repo/utils";

/**
 * S12-09 / D39: who may start a checkout while public signup is closed.
 *
 * "Role-less" = a public-signup account the club never let in: not a club /
 * platform admin, no Member row in the club (invitees get one when they accept;
 * lapsed members keep theirs, D29), and no pending invitation. Those users are
 * refused until launch; everyone else keeps today's flow.
 */
export async function isInvitedOrStaff(
	user: { id: string; email: string; role?: string | null },
	organizationId?: string,
): Promise<boolean> {
	if (user.role === "admin" || user.role === "platformAdmin") {
		return true;
	}

	const membership = await db.member.findFirst({
		where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
		select: { id: true },
	});

	if (membership) {
		return true;
	}

	return await hasPendingInvitation(user.email);
}

/** True when the user may start a checkout under the D39 launch flag. */
export async function canCheckoutBeforeLaunch(
	user: { id: string; email: string; role?: string | null },
	organizationId?: string,
): Promise<boolean> {
	return isPublicSignupOpen() || (await isInvitedOrStaff(user, organizationId));
}
