import { listOffersForAdmin } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const listOffersAdmin = adminProcedure
	.route({ method: "GET", path: "/admin/paddock/offers", tags: ["Paddock"], summary: "List partner offers" })
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ input }) => ({ offers: await listOffersForAdmin({ organizationId: input.organizationId }) }));
