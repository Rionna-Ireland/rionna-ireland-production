import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import type { Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

/**
 * Update a trainer. Every field is optional; `undefined` leaves it unchanged
 * and `null` clears it.
 * - S13-10 `location`: provider sync only fills this while empty, so a value
 *   set here is an override.
 * - S13-11 `userId`: links the trainer to an app account (so their posts and
 *   comments carry the "trainer" badge).
 * - S13-11 `avatarUrl`: the avatar shown on posts attributed to the trainer.
 */
export const updateTrainer = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/trainers/{trainerId}",
		tags: ["Horses"],
		summary: "Update trainer (location, linked account, avatar)",
	})
	.input(
		z.object({
			/** Defaults to the session's active organization. */
			organizationId: z.string().optional(),
			trainerId: z.string(),
			location: z.string().trim().nullable().optional(),
			userId: z.string().nullable().optional(),
			avatarUrl: z.string().url().nullable().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const activeOrgId = context.session.activeOrganizationId;
		const organizationId = input.organizationId ?? activeOrgId;
		if (!organizationId || organizationId !== activeOrgId) {
			throw new ORPCError("FORBIDDEN");
		}
		const trainer = await db.trainer.findFirst({
			where: { id: input.trainerId, organizationId },
		});
		if (!trainer) {
			throw new ORPCError("NOT_FOUND", { message: "Trainer not found" });
		}

		if (input.userId) {
			const member = await db.member.findFirst({
				where: { organizationId, userId: input.userId },
				select: { id: true },
			});
			if (!member) {
				return { ok: false as const, reason: "not_a_member" };
			}
			const taken = await db.trainer.findFirst({
				where: { userId: input.userId, id: { not: trainer.id } },
				select: { id: true },
			});
			if (taken) {
				return { ok: false as const, reason: "already_linked" };
			}
		}

		const data: Prisma.TrainerUncheckedUpdateInput = {};
		if (input.location !== undefined) data.location = input.location || null;
		if (input.userId !== undefined) data.userId = input.userId;
		if (input.avatarUrl !== undefined) {
			const meta =
				trainer.meta && typeof trainer.meta === "object" && !Array.isArray(trainer.meta)
					? { ...(trainer.meta as Record<string, unknown>) }
					: {};
			if (input.avatarUrl) meta.avatarUrl = input.avatarUrl;
			else delete meta.avatarUrl;
			data.meta = meta as Prisma.InputJsonObject;
		}

		const updated = await db.trainer.update({ where: { id: trainer.id }, data });
		logger.info("Admin updated trainer", {
			event: "admin_trainer_updated",
			actorUserId: context.user.id,
			organizationId,
			trainerId: trainer.id,
			changedFields: (["location", "userId", "avatarUrl"] as const).filter(
				(field) => input[field] !== undefined,
			),
		});
		return { ok: true as const, trainer: updated };
	});
