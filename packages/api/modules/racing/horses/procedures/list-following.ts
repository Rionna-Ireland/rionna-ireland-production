import { ORPCError } from "@orpc/client";

import { protectedProcedure } from "../../../../orpc/procedures";
import { listFollowedHorses } from "../lib/horse-follows";

export const listFollowingProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/horses/following",
		tags: ["Horses"],
		summary: "List horses the member follows",
	})
	.handler(async ({ context }) => {
		if (!context.session.activeOrganizationId) {
			throw new ORPCError("BAD_REQUEST", { message: "No active organization" });
		}

		return listFollowedHorses({
			organizationId: context.session.activeOrganizationId,
			userId: context.user.id,
		});
	});
