import { deleteOffer as deleteOfferRow } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const deleteOffer = adminProcedure
	.route({ method: "POST", path: "/admin/paddock/offers/{offerId}/delete", tags: ["Paddock"], summary: "Delete a partner offer" })
	.input(z.object({ organizationId: z.string(), offerId: z.string() }))
	.handler(async ({ input, context }) => {
		const deleted = await deleteOfferRow(input);
		if (!deleted) return { ok: false as const, reason: "not_found" as const };
		logger.info("Admin deleted partner offer", {
			event: "admin_partner_offer_deleted",
			actorUserId: context.user.id,
			organizationId: input.organizationId,
			offerId: input.offerId,
		});
		return { ok: true as const };
	});
