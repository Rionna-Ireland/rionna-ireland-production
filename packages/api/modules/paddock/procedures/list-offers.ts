import { db, listActiveOffers, parseOrgMetadata } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { type OfferView, toOfferView } from "../lib/offer-view";

export interface ListOffersResult {
	ok: boolean;
	offers: OfferView[];
}

/** Member-visible partner offers (S12-01 §3). Plain catalogue — no redemption state. */
export const listOffers = protectedProcedure
	.route({ method: "GET", path: "/paddock/offers", tags: ["Paddock"], summary: "Active partner offers" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input, context: { user } }): Promise<ListOffersResult> => {
		const empty: ListOffersResult = { ok: true, offers: [] };
		const org = await db.organization.findUnique({ where: { id: input.organizationId } });
		if (!org || parseOrgMetadata(org.metadata).features?.paddock === false) return empty;
		const member = await db.member.findFirst({
			where: { userId: user.id, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!member) return empty;
		const rows = await listActiveOffers({ organizationId: input.organizationId, now: new Date() });
		return { ok: true, offers: rows.map(toOfferView) };
	});
