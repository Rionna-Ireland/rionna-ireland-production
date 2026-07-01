import { getActiveOrganization } from "@auth/lib/server";
import { CircleFeedList } from "@member-hub/components/CircleFeedList";
import { getMemberFeed } from "@repo/api/modules/circle/procedures/get-member-feed";
import { PageHeader } from "@shared/components/PageHeader";
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
	return { title: activeOrganization ? `Feed · ${activeOrganization.name}` : "Feed" };
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

	const result = await getMemberFeed.callable({ context: { headers: await headers() } })({
		organizationId: activeOrganization.id,
		page: 1,
		perPage: PER_PAGE,
	});

	return (
		<div>
			<PageHeader title="Feed" />

			{!result.ok ? (
				<p className="text-muted-foreground">
					We couldn't load your feed right now. Please try again shortly.
				</p>
			) : result.items.length === 0 ? (
				<p className="text-muted-foreground">
					Your feed is quiet right now — open the app for the latest.
				</p>
			) : (
				<CircleFeedList
					organizationId={activeOrganization.id}
					basePath={`/${organizationSlug}`}
					initialItems={result.items}
					initialPage={result.page}
					initialHasNextPage={result.hasNextPage}
					perPage={PER_PAGE}
				/>
			)}
		</div>
	);
}
