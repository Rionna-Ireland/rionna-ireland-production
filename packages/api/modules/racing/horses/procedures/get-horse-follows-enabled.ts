import { z } from "zod";

import { protectedProcedure } from "../../../../orpc/procedures";
import { horseFollowsEnabled } from "../lib/horse-follows";

/**
 * S8-04 §5: exposes the org-level `features.horseFollows` kill-switch to the
 * client so it can hide/grey the follow controls (spec: "UI hides/greys the
 * controls on this flag (web MyHorsesSection switch)") instead of only
 * discovering the flag is off after a mutation silently no-ops.
 */
export const getHorseFollowsEnabledProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/horses/follows-enabled",
		tags: ["Horses"],
		summary: "Whether the org-level horse-follows feature is enabled",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ input }) => {
		return { enabled: await horseFollowsEnabled(input.organizationId) };
	});
