import {
	getOrganizationMembership,
	getPurchasesByOrganizationId,
	getPurchasesByUserId,
} from "@repo/database";
import { getPlanIdByProviderPriceId, getPlanPriceByProviderPriceId } from "@repo/payments";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";

export async function getVisiblePurchases({
	organizationId,
	userId,
}: {
	organizationId?: string;
	userId: string;
}) {
	if (!organizationId) {
		return getPurchasesByUserId(userId);
	}

	const membership = await getOrganizationMembership(organizationId, userId);

	// Org-wide purchases expose every member's billing/subscription rows, so
	// gate them on a privileged role. A plain `member` only ever sees their own.
	if (membership?.role === "owner" || membership?.role === "admin") {
		return getPurchasesByOrganizationId(organizationId);
	}

	// Fall back to the user's own purchases so checkout-return polling stays
	// user-scoped until membership creation finishes.
	return getPurchasesByUserId(userId);
}

export const listPurchases = protectedProcedure
	.route({
		method: "GET",
		path: "/payments/purchases",
		tags: ["Payments"],
		summary: "Get purchases",
		description: "Get all purchases of the current user or the provided organization",
	})
	.input(
		z.object({
			organizationId: z.string().optional(),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		const purchases = await getVisiblePurchases({
			organizationId,
			userId: user.id,
		});

		return purchases.map((purchase) => ({
			...purchase,
			planId: getPlanIdByProviderPriceId(purchase.priceId),
			planPrice: getPlanPriceByProviderPriceId(purchase.priceId)?.price ?? null,
		}));
	});
