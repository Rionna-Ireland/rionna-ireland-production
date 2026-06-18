import { ORPCError } from "@orpc/client";
import { getHorseById } from "@repo/database";
import { provisionHorseSpace } from "@repo/payments/lib/circle-horse-provisioning";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

/**
 * Admin-triggered retry for a horse whose Circle space provisioning failed
 * (Circle down on create, or spaceGroupId configured later). Re-runs the
 * fail-safe provisioning fn and returns the refreshed horse. The reconciliation
 * cron does this automatically too — this is the manual "retry now" affordance.
 */
export const retryHorseSpaceProvisioning = adminProcedure
	.route({
		method: "POST",
		path: "/admin/horses/{horseId}/retry-circle-space",
		tags: ["Horses"],
		summary: "Retry Circle space provisioning for a horse",
	})
	.input(z.object({ horseId: z.string() }))
	.handler(async ({ input }) => {
		const horse = await getHorseById(input.horseId);
		if (!horse) {
			throw new ORPCError("NOT_FOUND", { message: "Horse not found" });
		}
		if (horse.circleSpaceId) {
			return horse;
		}

		await provisionHorseSpace({
			id: horse.id,
			name: horse.name,
			organizationId: horse.organizationId,
		});
		return (await getHorseById(horse.id)) ?? horse;
	});
