import { getActiveOrganization } from "@auth/lib/server";
import { config } from "@config";
import { CommunityFeed } from "@member-hub/components/community/CommunityFeed";
import { getMemberFeed } from "@repo/api/modules/circle/procedures/get-member-feed";
import { listFeedChips } from "@repo/api/modules/community/procedures/list-feed-chips";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

const PER_PAGE = 15;

export async function generateMetadata({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const { organizationSlug } = await params;
	const activeOrganization = await getActiveOrganization(organizationSlug);
	return { title: activeOrganization ? `Community · ${activeOrganization.name}` : "Community" };
}

export default async function MemberFeedPage({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const { organizationSlug } = await params;
	const activeOrganization = await getActiveOrganization(organizationSlug);
	if (!activeOrganization) {
		return notFound();
	}

	const callable = { context: { headers: await headers() } };
	const [initialFeed, initialChips] = await Promise.all([
		getMemberFeed.callable(callable)({
			organizationId: activeOrganization.id,
			page: 1,
			perPage: PER_PAGE,
		}),
		// Chips are optional chrome: a failure renders the feed without them.
		listFeedChips
			.callable(callable)({ organizationId: activeOrganization.id })
			.catch(() => null),
	]);

	return (
		<CommunityFeed
			organizationId={activeOrganization.id}
			basePath={`/${organizationSlug}`}
			perPage={PER_PAGE}
			marketingUrl={config.marketingUrl}
			initialFeed={initialFeed}
			initialChips={initialChips}
		/>
	);
}
