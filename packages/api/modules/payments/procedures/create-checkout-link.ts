import { ORPCError } from "@orpc/client";
import { db, getOrganizationById } from "@repo/database";
import { logger } from "@repo/logs";
import {
	createCheckoutLink as createCheckoutLinkFn,
	findPriceByPlanId,
	getCustomerIdFromEntity,
	getProviderPriceIdByPlanId,
	type PlanId,
} from "@repo/payments";
import { z } from "zod";

import { localeMiddleware } from "../../../orpc/middleware/locale-middleware";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveSafeRedirectUrl } from "../lib/safe-redirect-url";

export const createCheckoutLink = protectedProcedure
	.use(localeMiddleware)
	.route({
		method: "POST",
		path: "/payments/create-checkout-link",
		tags: ["Payments"],
		summary: "Create checkout link",
		description: "Creates a checkout link for a one-time or subscription product",
	})
	.input(
		z.object({
			planId: z.string(),
			type: z.enum(["one-time", "subscription"]),
			interval: z.enum(["month", "year"]).optional(),
			redirectUrl: z.string().optional(),
			organizationId: z.string().optional(),
		}),
	)
	.handler(
		async ({
			input: { planId, redirectUrl, type, interval, organizationId },
			context: { user },
		}) => {
			const safeRedirectUrl = resolveSafeRedirectUrl(redirectUrl);

			// D29: a user may hold the "member" role in at most one organization.
			// Block checkout if they already have ANY Member row (regardless of role)
			// targeting a different org. Platform admins are exempt — they may shop
			// across orgs while impersonating.
			if (user.role !== "platformAdmin") {
				const existingMembership = await db.member.findFirst({
					where: {
						userId: user.id,
						...(organizationId ? { organizationId: { not: organizationId } } : {}),
					},
					select: { id: true, organizationId: true, role: true },
				});

				if (existingMembership) {
					throw new ORPCError("CONFLICT", {
						message:
							"This account is already a member of another club. Please use a different email to join a new club.",
					});
				}
			}

			// Checkout happens before the webhook creates the Member row, so a
			// pre-existing org membership cannot be required here.
			const customerId = await getCustomerIdFromEntity({
				userId: user.id,
			});

			const normalizedType = type === "subscription" ? "subscription" : "one-time";
			const price = findPriceByPlanId(planId as PlanId, {
				type: normalizedType,
				interval,
			});
			const priceId = getProviderPriceIdByPlanId(planId as PlanId, {
				type: normalizedType,
				interval,
			});

			if (!price || !priceId) {
				throw new ORPCError("NOT_FOUND");
			}

			const trialPeriodDays =
				price && "trialPeriodDays" in price ? price.trialPeriodDays : undefined;

			const organization = organizationId
				? await getOrganizationById(organizationId)
				: undefined;

			if (organization === null) {
				throw new ORPCError("NOT_FOUND");
			}

			const seats =
				organization && price && "seatBased" in price && price.seatBased
					? organization.members.length
					: undefined;

			try {
				const checkoutLink = await createCheckoutLinkFn({
					type,
					priceId,
					email: user.email,
					name: user.name ?? "",
					redirectUrl: safeRedirectUrl,
					userId: user.id,
					...(organizationId ? { organizationId } : {}),
					trialPeriodDays,
					seats,
					customerId: customerId ?? undefined,
				});

				if (!checkoutLink) {
					throw new ORPCError("INTERNAL_SERVER_ERROR");
				}

				return { checkoutLink };
			} catch (e) {
				logger.error(e);
				throw new ORPCError("INTERNAL_SERVER_ERROR");
			}
		},
	);
