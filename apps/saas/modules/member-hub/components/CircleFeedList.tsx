"use client";

import { orpcClient } from "@shared/lib/orpc-client";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { CircleFeedCard, type CircleFeedCardItem } from "./CircleFeedCard";

interface CircleFeedListProps {
	organizationId: string;
	basePath: string;
	initialItems: CircleFeedCardItem[];
	initialPage: number;
	initialHasNextPage: boolean;
	perPage: number;
}

export function CircleFeedList({
	organizationId,
	basePath,
	initialItems,
	initialPage,
	initialHasNextPage,
	perPage,
}: CircleFeedListProps) {
	// Page 1 is sourced from TanStack Query (seeded with the server-rendered
	// result) so that other surfaces — e.g. MyHorsesFollowPanel's follow
	// toggles — can invalidate `orpc.circle.getMemberFeed` and have the feed
	// visibly react. Subsequent pages ("load more") are appended locally.
	const feedQuery = useQuery({
		...orpc.circle.getMemberFeed.queryOptions({
			input: { organizationId, page: 1, perPage },
		}),
		initialData: {
			ok: true,
			items: initialItems,
			page: initialPage,
			hasNextPage: initialHasNextPage,
		},
	});

	const [extraItems, setExtraItems] = useState<CircleFeedCardItem[]>([]);
	const [page, setPage] = useState(initialPage);
	const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
	const [isLoading, setIsLoading] = useState(false);

	// Whenever the first page refetches (e.g. after a follow/unfollow toggle
	// invalidates the query), drop any "load more" pages and reset pagination
	// so the visible list matches the freshly filtered feed.
	useEffect(() => {
		setExtraItems([]);
		setPage(feedQuery.data.page);
		setHasNextPage(feedQuery.data.hasNextPage);
	}, [feedQuery.data]);

	async function loadMore() {
		if (!hasNextPage || isLoading) {
			return;
		}
		setIsLoading(true);
		try {
			const next = page + 1;
			const result = await orpcClient.circle.getMemberFeed({
				organizationId,
				page: next,
				perPage,
			});
			setExtraItems((prev) => [...prev, ...result.items]);
			setPage(result.page);
			setHasNextPage(result.hasNextPage);
		} finally {
			setIsLoading(false);
		}
	}

	const items = [...feedQuery.data.items, ...extraItems];

	return (
		<div>
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{items.map((item) => (
					<CircleFeedCard key={`${item.spaceId}-${item.id}`} item={item} basePath={basePath} />
				))}
			</div>
			{hasNextPage ? (
				<div className="mt-10 flex justify-center">
					<button
						type="button"
						onClick={loadMore}
						disabled={isLoading}
						className="rounded-full bg-primary px-6 py-2.5 font-mono text-xs uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
					>
						{isLoading ? "Loading…" : "Load more"}
					</button>
				</div>
			) : null}
		</div>
	);
}
