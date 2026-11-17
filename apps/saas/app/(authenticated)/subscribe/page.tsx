import { MembershipsClosedNotice } from "@auth/components/MembershipsClosedNotice";
import { getOrganizationList, getSession } from "@auth/lib/server";
import { requireTermsAccepted } from "@auth/lib/terms-gate";
import { listPurchases } from "@payments/lib/server";
import { canCheckoutBeforeLaunch } from "@repo/api/modules/payments/lib/checkout-eligibility";
import { db } from "@repo/database";
import { config as paymentsConfig } from "@repo/payments/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { AuthWrapper } from "@shared/components/AuthWrapper";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { SubscribeButton } from "./SubscribeButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SubscribePage() {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	// Already subscribed — skip to onboarding or app
	const purchases = await listPurchases();
	const { activePlan } = createPurchasesHelper(purchases);

	if (activePlan) {
		// Mirrors the (main) layout's org gate: redirecting without a Member row would loop.
		if ((await getOrganizationList()).length > 0) {
			redirect("/");
		}

		const t = await getTranslations("subscribe");
		return (
			<AuthWrapper>
				<p className="text-center">{t("membershipPending")}</p>
			</AuthWrapper>
		);
	}

	// Phase 1: resolve the single organization (Pink Connections)
	const organization = await db.organization.findFirst({
		select: { id: true, name: true, metadata: true },
	});

	if (!organization) {
		throw new Error("No organization found. Run the seed script first.");
	}

	await requireTermsAccepted("/subscribe");

	// S12-09 / D39: until launch, only invited users / staff may subscribe.
	if (!(await canCheckoutBeforeLaunch(session.user, organization.id))) {
		return (
			<AuthWrapper>
				<MembershipsClosedNotice />
			</AuthWrapper>
		);
	}

	// Read price from the payments config
	const membershipPlan = paymentsConfig.plans.membership;
	const price =
		membershipPlan && "prices" in membershipPlan ? membershipPlan.prices[0] : undefined;

	return (
		<AuthWrapper>
			<div className="text-center">
				<h1 className="font-bold text-2xl lg:text-3xl">Join {organization.name}</h1>
				<p className="mt-2 text-muted-foreground">
					Get access to Our Stables, Pulse dashboard, community, and more.
				</p>
			</div>

			{price && (
				<div className="mt-6 text-center">
					<p className="font-medium text-3xl">
						&euro;{price.amount}
						<span className="font-normal text-base text-muted-foreground">
							{" "}
							/ month
						</span>
					</p>
				</div>
			)}

			<div className="mt-6">
				<SubscribeButton organizationId={organization.id} />
			</div>
		</AuthWrapper>
	);
}
