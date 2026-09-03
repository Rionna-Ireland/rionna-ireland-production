import { getOfferForOrg } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const findOffer = adminProcedure
	.route({ method: "GET", path: "/admin/paddock/offers/{offerId}", tags: ["Paddock"], summary: "Find a partner offer" })
	.input(z.object({ organizationId: z.string(), offerId: z.string() }))
	.handler(async ({ input }) => ({ offer: await getOfferForOrg(input) }));
