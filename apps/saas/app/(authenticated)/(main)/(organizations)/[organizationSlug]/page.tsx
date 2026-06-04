import { getActiveOrganization, getSession } from "@auth/lib/server";
import { MemberDashboard } from "@member-hub/components/MemberDashboard";
import { getSubscriptionSummaryQueryKey } from "@payments/lib/query-keys";
import { loadSubscriptionSummary } from "@repo/api/modules/payments/procedures/get-subscription-summary";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getStripeClient } from "@repo/payments";
import { PageHeader } from "@shared/components/PageHeader";
import { getServerQueryClient } from "@shared/lib/server";
import { notFound } from "next/navigation";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const { organizationSlug } = await params;

	const activeOrganization = await getActiveOrganization(organizationSlug as string);

	return {
		title: activeOrganization?.name,
	};
}

export default async function OrganizationPage({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const { organizationSlug } = await params;

	const activeOrganization = await getActiveOrganization(organizationSlug as string);

	if (!activeOrganization) {
		return notFound();
	}

	const session = await getSession();
	const queryClient = getServerQueryClient();

	if (session?.user) {
		try {
			const summary = await loadSubscriptionSummary(session.user.id, {
				db,
				getStripeClient,
				logger,
			});
			await queryClient.prefetchQuery({
				queryKey: getSubscriptionSummaryQueryKey(),
				queryFn: () => summary,
			});
		} catch {
			// Swallow — render the dashboard either way; the client query refetches.
		}
	}

	return (
		<div>
			<PageHeader title="Your membership" />

			<MemberDashboard />
		</div>
	);
}
