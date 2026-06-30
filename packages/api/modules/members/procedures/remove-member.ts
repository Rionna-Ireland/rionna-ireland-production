import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { RemoveMemberError, removeMember } from "../lib/remove-member";

/**
 * S2-10: Guided "Remove from membership".
 *
 * The one destructive admin action — cancels the member's Stripe subscription,
 * deactivates their Circle space (preserving content), and hard-deletes the
 * Better-Auth Member row. Returns a per-system { stripe, circle, app } summary
 * for the confirmation wizard.
 *
 * @see Architecture/specs/S2-10-guided-member-removal.md
 */
export const removeClubMember = adminProcedure
	.route({
		method: "POST",
		path: "/admin/members/remove",
		tags: ["Members"],
		summary: "Remove a member from the club (cancel Stripe + deactivate Circle + revoke membership)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			memberId: z.string(),
			confirmName: z.string().min(1),
		}),
	)
	.handler(async ({ input: { organizationId, memberId, confirmName }, context }) => {
		// Tenant-isolation: the admin may only act on their own active org. The
		// adminProcedure middleware is a global role check, so without this an
		// admin of one club could pass another club's organizationId.
		if (context.session.activeOrganizationId !== organizationId) {
			throw new ORPCError("FORBIDDEN");
		}

		const member = await db.member.findUnique({
			where: { id: memberId },
			include: { user: { select: { name: true, email: true } } },
		});
		if (!member || member.organizationId !== organizationId) {
			throw new ORPCError("NOT_FOUND");
		}

		// Confirmation gate: the typed name must match the member, so a mis-wired
		// client can't remove the wrong person.
		const displayName = member.user.name ?? member.user.email;
		if (confirmName.trim() !== displayName.trim()) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Confirmation name does not match the member",
			});
		}

		try {
			return await removeMember({
				memberId,
				organizationId,
				actorUserId: context.user.id,
			});
		} catch (error) {
			if (error instanceof RemoveMemberError) {
				throw new ORPCError(
					error.code === "member_not_found" ? "NOT_FOUND" : "BAD_REQUEST",
					{ message: error.message },
				);
			}
			throw error;
		}
	});
