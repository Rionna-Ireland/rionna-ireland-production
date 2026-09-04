import { ORPCError } from "@orpc/client";
import { getHorseById } from "@repo/database";
import { logger } from "@repo/logs";
import { provisionHorseSpace } from "@repo/payments/lib/circle-horse-provisioning";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { mergeSpaceSettings } from "../../../community/lib/write-space-settings";

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
		const provisioned = (await getHorseById(horse.id)) ?? horse;

		// New horse spaces default to member-posting on (S12-02a). Best-effort:
		// a metadata-write hiccup must never fail the retry.
		if (provisioned.circleSpaceId && provisioned.circleSpaceStatus === "active") {
			try {
				await mergeSpaceSettings({
					organizationId: provisioned.organizationId,
					spaceId: provisioned.circleSpaceId,
					patch: { memberPosting: true },
				});
			}
			catch (error) {
				logger.error("Failed to default horse space to member-posting on", {
					event: "horse_space_default_posting_failed",
					horseId: provisioned.id,
					organizationId: provisioned.organizationId,
					spaceId: provisioned.circleSpaceId,
					error: String(error),
				});
			}
		}

		return provisioned;
	});
