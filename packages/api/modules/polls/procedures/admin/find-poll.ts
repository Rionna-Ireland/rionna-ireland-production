import { getPollForOrg } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const findPoll = adminProcedure
	.route({ method: "GET", path: "/admin/polls/{pollId}", tags: ["Polls"], summary: "Get a poll" })
	.input(z.object({ organizationId: z.string(), pollId: z.string() }))
	.handler(async ({ input }) => ({ poll: await getPollForOrg(input) }));
