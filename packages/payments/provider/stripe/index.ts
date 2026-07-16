import { createPurchase, db, getPurchaseBySubscriptionId, updatePurchase } from "@repo/database";
import { logger } from "@repo/logs";
import Stripe from "stripe";

import {
	deactivateCircleMember,
	provisionCircleMember,
	reactivateCircleMember,
} from "../../lib/circle-provisioning";
import { setCustomerIdToEntity } from "../../lib/customer";
import { getPlanIdByProviderPriceId } from "../../lib/provider-price-ids";
import { sendWelcomeEmail } from "../../lib/send-welcome-email";
import { clearEventDedup, isEventDuplicate } from "../../lib/stripe-dedup";
import type {
	CancelSubscription,
	CreateCheckoutLink,
	CreateCustomerPortalLink,
	SetSubscriptionSeats,
	WebhookHandler,
} from "../../types";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
	if (stripeClient) {
		return stripeClient;
	}

	const stripeSecretKey = process.env.STRIPE_SECRET_KEY as string;

	if (!stripeSecretKey) {
		throw new Error("Missing env variable STRIPE_SECRET_KEY");
	}

	// Pin the API version so webhook event shapes stay stable across SDK bumps
	// and dashboard-level version changes. Upgrade deliberately, not implicitly.
	stripeClient = new Stripe(stripeSecretKey, {
		apiVersion: "2026-03-25.dahlia",
	});

	return stripeClient;
}

export const createCheckoutLink: CreateCheckoutLink = async (options) => {
	const stripeClient = getStripeClient();
	const {
		type,
		priceId,
		redirectUrl,
		customerId,
		organizationId,
		userId,
		trialPeriodDays,
		seats,
		email,
	} = options;

	const metadata = {
		organization_id: organizationId || null,
		user_id: userId || null,
	};

	const response = await stripeClient.checkout.sessions.create({
		mode: type === "subscription" ? "subscription" : "payment",
		success_url: redirectUrl ?? "",
		line_items: [
			{
				quantity: seats ?? 1,
				price: priceId,
			},
		],
		...(customerId ? { customer: customerId } : { customer_email: email }),
		...(type === "one-time"
			? {
					payment_intent_data: {
						metadata,
					},
					customer_creation: "always",
				}
			: {
					subscription_data: {
						metadata,
						trial_period_days: trialPeriodDays,
					},
				}),
		metadata,
	});

	return response.url;
};

export const createCustomerPortalLink: CreateCustomerPortalLink = async ({
	customerId,
	redirectUrl,
}) => {
	const stripeClient = getStripeClient();

	const response = await stripeClient.billingPortal.sessions.create({
		customer: customerId,
		return_url: redirectUrl ?? "",
	});

	return response.url;
};

export const setSubscriptionSeats: SetSubscriptionSeats = async ({ id, seats }) => {
	const stripeClient = getStripeClient();

	const subscription = await stripeClient.subscriptions.retrieve(id);

	if (!subscription) {
		throw new Error("Subscription not found.");
	}

	await stripeClient.subscriptions.update(id, {
		items: [
			{
				id: subscription.items.data[0].id,
				quantity: seats,
			},
		],
	});
};

export const cancelSubscription: CancelSubscription = async (id) => {
	const stripeClient = getStripeClient();

	await stripeClient.subscriptions.cancel(id);
};

// ──────────────────────────────────────────────
// Subscription lifecycle handlers (S1-04)
// ──────────────────────────────────────────────

// D29: dedicated error class so the handler can distinguish a uniqueness
// violation (cancel the subscription, return 200) from a transient DB failure
// (let Stripe retry).
class D29ViolationError extends Error {
	constructor(
		public readonly userId: string,
		public readonly existingOrganizationId: string,
		public readonly attemptedOrganizationId: string,
	) {
		super(
			`D29 violation: user ${userId} already a member of organization ${existingOrganizationId}`,
		);
		this.name = "D29ViolationError";
	}
}

export async function handleSubscriptionCreated(event: Stripe.Event) {
	const subscription = event.data.object as Stripe.Subscription;
	const { metadata, customer, items, id } = subscription;

	const userId = metadata?.user_id || null;
	const organizationId = metadata?.organization_id || null;

	const priceId = items?.data[0].price?.id;
	const planId = priceId ? getPlanIdByProviderPriceId(priceId) : null;

	if (!planId || !priceId) {
		throw new Error("Missing plan or price ID in subscription.created");
	}

	if (userId) {
		await setCustomerIdToEntity(customer as string, {
			userId,
		});
	}

	// Wrap Purchase + Member creation in a transaction to avoid orphaned rows.
	// The purchase is upserted so replays can safely resume after partial failure.
	let member: Awaited<ReturnType<typeof db.member.upsert>> | null = null;
	try {
		member = await db.$transaction(async (tx) => {
			await tx.purchase.upsert({
				where: { subscriptionId: id },
				create: {
					subscriptionId: id,
					organizationId,
					userId,
					customerId: customer as string,
					type: "SUBSCRIPTION",
					priceId,
					status: subscription.status,
				},
				update: {
					organizationId,
					userId,
					customerId: customer as string,
					type: "SUBSCRIPTION",
					priceId,
					status: subscription.status,
				},
			});

			// 2. Create Member row (linking user to organization) if both IDs present
			if (userId && organizationId) {
				// D29 recheck: defence-in-depth in case a checkout was created outside
				// `createCheckoutLink` (which already enforces this). Only blocks NEW
				// memberships in a different org — re-subscribing to the same org is fine.
				const user = await tx.user.findUnique({
					where: { id: userId },
					select: { role: true },
				});

				if (user?.role !== "platformAdmin") {
					const conflictingMembership = await tx.member.findFirst({
						where: {
							userId,
							organizationId: { not: organizationId },
						},
						select: { id: true, organizationId: true },
					});

					if (conflictingMembership) {
						throw new D29ViolationError(
							userId,
							conflictingMembership.organizationId,
							organizationId,
						);
					}
				}

				return tx.member.upsert({
					where: {
						organizationId_userId: {
							organizationId,
							userId,
						},
					},
					update: {},
					create: {
						userId,
						organizationId,
						role: "member",
						createdAt: new Date(),
					},
				});
			}

			return null;
		});
	} catch (error) {
		if (error instanceof D29ViolationError) {
			// User cannot legitimately become a member here. Cancel the Stripe
			// subscription so the customer stops being billed, mark a rejected
			// Purchase row for ops visibility, and return cleanly so Stripe does
			// NOT retry (which would re-trigger the same violation forever).
			logger.error("D29 violation: cancelling subscription", {
				userId: error.userId,
				existingOrganizationId: error.existingOrganizationId,
				attemptedOrganizationId: error.attemptedOrganizationId,
				subscriptionId: id,
			});
			try {
				await cancelSubscription(id);
			} catch (cancelError) {
				logger.error("Failed to cancel subscription after D29 violation", {
					subscriptionId: id,
					error: cancelError instanceof Error ? cancelError.message : String(cancelError),
				});
			}
			await db.purchase.upsert({
				where: { subscriptionId: id },
				create: {
					subscriptionId: id,
					organizationId,
					userId,
					customerId: customer as string,
					type: "SUBSCRIPTION",
					priceId,
					status: "rejected_d29",
				},
				update: { status: "rejected_d29" },
			});
			return;
		}
		throw error;
	}

	// 3. Provision Circle member (Layer 3: pre-call existence check)
	if (member && !member.circleMemberId && userId && organizationId) {
		await provisionCircleMember({ id: member.id, userId, organizationId }, event.id);
	}

	// 4. Send welcome email (S2-05)
	if (userId && organizationId) {
		await sendWelcomeEmail(userId, organizationId);
	}
}

export async function handleSubscriptionUpdated(event: Stripe.Event) {
	const subscription = event.data.object as Stripe.Subscription;
	const subscriptionId = subscription.id;

	const existingPurchase = await getPurchaseBySubscriptionId(subscriptionId);

	if (existingPurchase) {
		const priceId = subscription.items?.data[0].price?.id;

		await updatePurchase({
			id: existingPurchase.id,
			status: subscription.status,
			...(priceId ? { priceId } : {}),
		});
	}

	// If transitioning from canceled to active, reactivate Circle member
	// Stripe's previous_attributes is a webhook-specific field not in base types
	const previousAttributes = (
		event.data as unknown as { previous_attributes?: Record<string, unknown> }
	).previous_attributes;
	if (previousAttributes?.status === "canceled" && subscription.status === "active") {
		// Reuse existingPurchase instead of fetching again
		const purchase = existingPurchase ?? (await getPurchaseBySubscriptionId(subscriptionId));
		if (purchase?.userId) {
			const member = await db.member.findFirst({
				where: {
					userId: purchase.userId,
					organizationId: purchase.organizationId ?? undefined,
				},
			});
			if (member?.circleMemberId && member.circleStatus === "deactivated") {
				await reactivateCircleMember({
					id: member.id,
					circleMemberId: member.circleMemberId,
				});
			}
		}
	}
}

export async function handleSubscriptionDeleted(event: Stripe.Event) {
	const subscription = event.data.object as Stripe.Subscription;

	// Flip Purchase.status to "canceled" — DO NOT DELETE the row (D9 decision)
	await db.purchase.updateMany({
		where: { subscriptionId: subscription.id },
		data: { status: "canceled" },
	});

	// Deactivate Circle member
	const purchase = await db.purchase.findFirst({
		where: { subscriptionId: subscription.id },
	});
	if (purchase?.userId) {
		const member = await db.member.findFirst({
			where: {
				userId: purchase.userId,
				organizationId: purchase.organizationId ?? undefined,
			},
		});
		if (member?.circleMemberId && member.circleStatus === "active") {
			await deactivateCircleMember({
				id: member.id,
				circleMemberId: member.circleMemberId,
			});
		}
	}
}

// ──────────────────────────────────────────────
// Webhook handler
// ──────────────────────────────────────────────

export const webhookHandler: WebhookHandler = async (req) => {
	const stripeClient = getStripeClient();

	if (!req.body) {
		return new Response("Invalid request.", {
			status: 400,
		});
	}

	let event: Stripe.Event | undefined;

	try {
		event = await stripeClient.webhooks.constructEventAsync(
			await req.text(),
			req.headers.get("stripe-signature") as string,
			process.env.STRIPE_WEBHOOK_SECRET as string,
		);
	} catch (e) {
		logger.error(e);

		return new Response("Invalid request.", {
			status: 400,
		});
	}

	// Layer 1: StripeEventLog dedup — claim the event up front, then release it
	// on failure so Stripe retries can safely resume partially completed work.
	if (await isEventDuplicate(event.id, event.type)) {
		return new Response(JSON.stringify({ received: true }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	try {
		switch (event.type) {
			case "checkout.session.completed": {
				const { mode, metadata, customer, id } = event.data.object;

				if (mode === "subscription") {
					break;
				}

				const checkoutSession = await stripeClient.checkout.sessions.retrieve(id, {
					expand: ["line_items"],
				});

				const priceId = checkoutSession.line_items?.data[0].price?.id;
				const planId = priceId ? getPlanIdByProviderPriceId(priceId) : null;

				if (!planId || !priceId) {
					// FABLE_AUDIT C3: this early return doesn't throw, so the catch
					// below never releases the dedup claim — Stripe's retries would
					// hit the dedup, get a 200, and the purchase would silently
					// never be created. Release the claim before returning non-2xx.
					await clearEventDedup(event.id);
					return new Response("Missing plan or price ID.", {
						status: 400,
					});
				}

				if (metadata?.user_id) {
					await setCustomerIdToEntity(customer as string, {
						userId: metadata.user_id,
					});
				}

				await createPurchase({
					organizationId: metadata?.organization_id || null,
					userId: metadata?.user_id || null,
					customerId: customer as string,
					type: "ONE_TIME",
					priceId,
				});

				break;
			}
			case "customer.subscription.created": {
				await handleSubscriptionCreated(event);
				break;
			}
			case "customer.subscription.updated": {
				await handleSubscriptionUpdated(event);
				break;
			}
			case "customer.subscription.deleted": {
				await handleSubscriptionDeleted(event);
				break;
			}
			case "invoice.payment_failed": {
				// No-op per D9 — Stripe handles dunning
				logger.info("invoice.payment_failed received — Stripe handles dunning", {
					eventId: event.id,
				});
				break;
			}

			default:
				return new Response("Unhandled event type.", {
					status: 200,
				});
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		await clearEventDedup(event.id);
		logger.error("Webhook handler error", {
			eventId: event.id,
			eventType: event.type,
			error: error instanceof Error ? error.message : String(error),
		});
		return new Response("Webhook processing failed", {
			status: 500,
		});
	}
};
