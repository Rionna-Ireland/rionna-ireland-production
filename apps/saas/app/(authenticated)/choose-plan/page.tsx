import { MembershipsClosedNotice } from "@auth/components/MembershipsClosedNotice";
import { getOrganizationList, getSession } from "@auth/lib/server";
import { requireTermsAccepted } from "@auth/lib/terms-gate";
import { PricingTable } from "@payments/components/PricingTable";
import { listPurchases } from "@payments/lib/server";
import { canCheckoutBeforeLaunch } from "@repo/api/modules/payments/lib/checkout-eligibility";
import { config as authConfig } from "@repo/auth/config";
import { config as paymentsConfig } from "@repo/payments/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { AuthWrapper } from "@shared/components/AuthWrapper";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata() {
	const t = await getTranslations("choosePlan");

	return {
		title: t("title"),
	};
}

export default async function ChoosePlanPage() {
	const t = await getTranslations("choosePlan");
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	let organizationId: string | undefined;
	if (authConfig.organizations.enable && paymentsConfig.billingAttachedTo === "organization") {
		const organization = (await getOrganizationList()).at(0);

		if (!organization) {
			redirect("/new-organization");
		}

		organizationId = organization.id;
	}

	const purchases = await listPurchases(organizationId);

	const { activePlan } = createPurchasesHelper(purchases);

	if (activePlan) {
		redirect("/");
	}

	await requireTermsAccepted("/choose-plan");

	// S12-09 / D39: until launch, show the waitlist instead of plans.
	if (!(await canCheckoutBeforeLaunch(session.user, organizationId))) {
		return (
			<AuthWrapper>
				<MembershipsClosedNotice />
			</AuthWrapper>
		);
	}

	return (
		<AuthWrapper contentClass="max-w-5xl">
			<div className="mb-4 text-center">
				<h1 className="font-bold text-2xl lg:text-3xl text-center">{t("title")}</h1>
				<p className="text-sm lg:text-base text-muted-foreground">{t("description")}</p>
			</div>

			<div>
				<PricingTable
					{...(organizationId
						? {
								organizationId,
							}
						: {
								userId: session.user.id,
							})}
				/>
			</div>
		</AuthWrapper>
	);
}
