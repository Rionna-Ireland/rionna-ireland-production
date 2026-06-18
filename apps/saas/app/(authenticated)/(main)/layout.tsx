import { getOrganizationList, getSession } from "@auth/lib/server";
import { PlatformImpersonationBanner } from "@platform/components/PlatformImpersonationBanner";
import { listPurchases } from "@repo/api/modules/payments/procedures/list-purchases";
import { config as authConfig } from "@repo/auth/config";
import { config as paymentsConfig } from "@repo/payments/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";

export default async function MainLayout({ children }: PropsWithChildren) {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	// D28: platform admins bypass subscription / onboarding / requireOrganization gates.
	// Their primary surface is /platform; if they land here without an impersonated org,
	// send them back there.
	const isPlatformAdmin = session.user.role === "platformAdmin";

	// Club admins (User.role === "admin") are staff, not paying members, so they bypass the
	// subscription + onboarding gates too — admin is independent of billing (D29 / S2-09).
	// Unlike platform admins they hold a real Member row, so they still pass the
	// requireOrganization gate below normally.
	const isAdmin = isPlatformAdmin || session.user.role === "admin";

	// Subscription check BEFORE onboarding (per D9: subscribe → then onboard)
	// Billing is user-scoped (billingAttachedTo: "user"), so query by userId not organizationId
	if (!isAdmin && paymentsConfig.requireActiveSubscription) {
		const purchases = await listPurchases.callable({
			context: { headers: await headers() },
		})({});

		const { activePlan } = createPurchasesHelper(purchases);

		if (!activePlan) {
			redirect("/subscribe");
		}
	}

	if (!isAdmin && authConfig.users.enableOnboarding && !session.user.onboardingComplete) {
		redirect("/onboarding");
	}

	const organizations = await getOrganizationList();

	if (authConfig.organizations.enable && authConfig.organizations.requireOrganization) {
		const organization =
			organizations.find((org) => org.id === session?.session.activeOrganizationId) ||
			organizations[0];

		if (!organization) {
			// Platform admins may have no Member rows but still carry an
			// `activeOrganizationId` from impersonation — let them through.
			if (isPlatformAdmin && session?.session.activeOrganizationId) {
				// fall through
			} else {
				redirect(isPlatformAdmin ? "/platform" : "/new-organization");
			}
		}
	}

	return (
		<>
			<PlatformImpersonationBanner />
			{children}
		</>
	);
}
