import { ORPCError } from "@orpc/server";
import { db } from "@repo/database";
import type { Prisma } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

/**
 * S13-11: link a trainer to an app account (so their posts/comments carry the
 * "trainer" badge) and/or set the avatar shown on attributed posts.
 */
export const updateTrainer = adminProcedure
	.route({
		method: "PUT",
		path: "/admin/trainers/{trainerId}",
		tags: ["Horses"],
		summary: "Update trainer (linked account, avatar)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			trainerId: z.string(),
			/** null unlinks; undefined leaves unchanged. */
			userId: z.string().nullable().optional(),
			avatarUrl: z.string().url().nullable().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (context.session.activeOrganizationId !== input.organizationId) {
			throw new ORPCError("FORBIDDEN");
		}
		const trainer = await db.trainer.findFirst({
			where: { id: input.trainerId, organizationId: input.organizationId },
		});
		if (!trainer) {
			throw new ORPCError("NOT_FOUND");
		}

		if (input.userId) {
			const member = await db.member.findFirst({
				where: { organizationId: input.organizationId, userId: input.userId },
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
		return { ok: true as const, trainer: updated };
	});
