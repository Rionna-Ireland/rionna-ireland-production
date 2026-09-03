import { createOffer as createOfferRow } from "@repo/database";
import { logger } from "@repo/logs";

import { adminProcedure } from "../../../../orpc/procedures";
import { offerWriteInput, toOfferWriteData } from "./offer-input";

export const createOffer = adminProcedure
	.route({ method: "POST", path: "/admin/paddock/offers", tags: ["Paddock"], summary: "Create a partner offer" })
	.input(offerWriteInput)
	.handler(async ({ input, context }) => {
		const { organizationId, ...rest } = input;
		const offer = await createOfferRow({ organizationId, ...toOfferWriteData(rest) });
		logger.info("Admin created partner offer", {
			event: "admin_partner_offer_created",
			actorUserId: context.user.id,
			organizationId,
			offerId: offer.id,
		});
		return { ok: true as const, offer };
	});
