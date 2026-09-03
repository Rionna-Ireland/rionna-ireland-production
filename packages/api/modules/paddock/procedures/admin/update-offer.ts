import { updateOffer as updateOfferRow } from "@repo/database";
import { logger } from "@repo/logs";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";
import { offerWriteInput, toOfferWriteData } from "./offer-input";

export const updateOffer = adminProcedure
	.route({ method: "POST", path: "/admin/paddock/offers/{offerId}/update", tags: ["Paddock"], summary: "Update a partner offer" })
	.input(offerWriteInput.extend({ offerId: z.string() }))
	.handler(async ({ input, context }) => {
		const { organizationId, offerId, ...rest } = input;
		const offer = await updateOfferRow({ organizationId, offerId, data: toOfferWriteData(rest) });
		if (!offer) return { ok: false as const, reason: "not_found" as const };
		logger.info("Admin updated partner offer", {
			event: "admin_partner_offer_updated",
			actorUserId: context.user.id,
			organizationId,
			offerId,
		});
		return { ok: true as const, offer };
	});
