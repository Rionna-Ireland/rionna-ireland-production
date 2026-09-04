import { ORPCError } from "@orpc/client";
import { db, markCommunityPostDeleted, resolveModerationFlag } from "@repo/database";
import type { ModerationStatus } from "@repo/database";
import { logger } from "@repo/logs";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export interface ResolveModerationResult {
	ok: boolean;
	status: ModerationStatus;
}

/**
 * Pure, unit-testable core.
 *
 * `dismiss` never touches Circle. `delete` on a post row calls Circle's
 * admin `deletePost` then marks our `CommunityPost` row deleted; on a
 * comment row it calls `deleteComment` (Admin v2 — Task 1 ruling). Circle
 * `not_found` counts as success either way (content already gone). Any
 * other Circle failure leaves the flag `open` and returns `ok:false`; the
 * DB update only ever transitions rows that are still `open`, so a flag
 * resolved concurrently (or that never existed / belongs to another org)
 * also comes back `ok:false, status:"open"`.
 */
export async function runResolveModeration(
	p: { organizationId: string; flagId: string; action: "delete" | "dismiss" },
	actorUserId: string,
): Promise<ResolveModerationResult> {
	const flag = await db.moderationFlag.findUnique({ where: { id: p.flagId } });
	if (!flag || flag.organizationId !== p.organizationId) {
		return { ok: false, status: "open" };
	}
	if (flag.status !== "open") {
		return { ok: false, status: flag.status as ModerationStatus };
	}

	if (p.action === "dismiss") {
		const updated = await resolveModerationFlag({
			id: p.flagId,
			organizationId: p.organizationId,
			status: "dismissed",
			resolvedByUserId: actorUserId,
		});
		if (!updated) {
			return { ok: false, status: "open" };
		}
		logger.info("Admin dismissed a moderation flag", {
			event: "admin_moderation_resolved",
			actorUserId,
			organizationId: p.organizationId,
			flagId: p.flagId,
			action: "dismiss",
		});
		return { ok: true, status: "dismissed" };
	}

	// action === "delete"
	const targetId = flag.surface === "post" ? flag.targetPostId : flag.targetCommentId;
	if (!targetId) {
		return { ok: false, status: "open" };
	}

	const org = await db.organization.findUnique({
		where: { id: p.organizationId },
		select: { slug: true },
	});
	if (!org?.slug) {
		return { ok: false, status: "open" };
	}
	const circle = createCircleService(org.slug);

	if (flag.surface === "post") {
		const outcome = await circle.deletePost(targetId);
		if (!outcome.ok && outcome.reason !== "not_found") {
			return { ok: false, status: "open" };
		}
		await markCommunityPostDeleted({ circlePostId: targetId, deletedBy: "admin" });
	}
	else {
		const outcome = await circle.deleteComment(targetId);
		if (!outcome.ok && outcome.reason !== "not_found") {
			return { ok: false, status: "open" };
		}
	}

	const updated = await resolveModerationFlag({
		id: p.flagId,
		organizationId: p.organizationId,
		status: "deleted",
		resolvedByUserId: actorUserId,
	});
	if (!updated) {
		return { ok: false, status: "open" };
	}

	logger.info("Admin deleted reported content", {
		event: "admin_moderation_resolved",
		actorUserId,
		organizationId: p.organizationId,
		flagId: p.flagId,
		action: "delete",
		surface: flag.surface,
	});
	return { ok: true, status: "deleted" };
}

export const resolveModeration = adminProcedure
	.route({
		method: "POST",
		path: "/admin/community/moderation/resolve",
		tags: ["Community"],
		summary: "Resolve a moderation flag (delete content or dismiss)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			flagId: z.string().min(1),
			action: z.enum(["delete", "dismiss"]),
		}),
	)
	.handler(async ({ input, context }): Promise<ResolveModerationResult> => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		return runResolveModeration(input, context.user.id);
	});
