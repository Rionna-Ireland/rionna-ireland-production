import { listPolls as listPollRows } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../../orpc/procedures";

export const listPolls = adminProcedure
	.route({ method: "GET", path: "/admin/polls", tags: ["Polls"], summary: "List polls" })
	.input(
		z.object({
			organizationId: z.string(),
			status: z.enum(["draft", "open", "closed"]).optional(),
			limit: z.number().min(1).max(100).default(20),
			offset: z.number().min(0).default(0),
		}),
	)
	.handler(async ({ input }) => listPollRows(input));
