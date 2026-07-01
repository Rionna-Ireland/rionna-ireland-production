import { ORPCError } from "@orpc/client";
import { db } from "@repo/database";
import { createCircleService } from "@repo/payments/lib/circle";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

const visibilityValues = ["member_public", "private"] as const;
export type HorseSpaceVisibility = (typeof visibilityValues)[number];

export interface SetHorseSpaceVisibilityInput {
	horseId: string;
	visibility: HorseSpaceVisibility;
}

export interface SetHorseSpaceVisibilityResult {
	ok: true;
	visibility: HorseSpaceVisibility;
}

/**
 * Pure, unit-testable core. Circle-first, DB-second: only persists the new
 * `circleSpaceVisibility` once Circle has confirmed the change, so the DB
 * never desyncs from the source of truth in Circle.
 */
export async function runSetHorseSpaceVisibility(
	organizationId: string,
	input: SetHorseSpaceVisibilityInput,
): Promise<SetHorseSpaceVisibilityResult> {
	const horse = await db.horse.findFirst({
		where: { id: input.horseId, organizationId },
		select: { id: true, circleSpaceId: true },
	});
	if (!horse) {
		throw new ORPCError("NOT_FOUND");
	}
	if (!horse.circleSpaceId) {
		throw new ORPCError("BAD_REQUEST", { message: "Horse has no Circle space yet; provision it first." });
	}

	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { slug: true },
	});
	if (!org?.slug) {
		throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
	}

	const circle = createCircleService(org.slug);
	const outcome = await circle.setSpaceVisibility({
		spaceId: horse.circleSpaceId,
		isPrivate: input.visibility === "private",
	});

	if (!outcome.ok) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Circle rejected the visibility change. Try again or set it in the Circle dashboard.",
		});
	}

	await db.horse.update({
		where: { id: horse.id },
		data: { circleSpaceVisibility: input.visibility },
	});

	return { ok: true, visibility: input.visibility };
}

export const setHorseSpaceVisibility = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/{horseId}/space-visibility",
		tags: ["Horses"],
		summary: "Set a horse's Circle space visibility",
	})
	.input(
		z.object({
			horseId: z.string(),
			visibility: z.enum(visibilityValues),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}
		return runSetHorseSpaceVisibility(context.session.activeOrganizationId, input);
	});
