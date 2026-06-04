import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getStripeClient } from "@repo/payments";

import { protectedProcedure } from "../../../orpc/procedures";
import { loadSubscriptionSummary } from "./get-subscription-summary.impl";

export type { SubscriptionSummary } from "./get-subscription-summary.impl";
export { loadSubscriptionSummary };

export const getSubscriptionSummary = protectedProcedure
	.route({
		method: "GET",
		path: "/payments/subscription-summary",
		tags: ["Payments"],
		summary: "Get the caller's subscription summary",
	})
	.handler(async ({ context: { user } }) => {
		return loadSubscriptionSummary(user.id, {
			db,
			getStripeClient,
			logger,
		});
	});
