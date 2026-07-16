"use client";

import { orpcClient } from "@shared/lib/orpc-client";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { applyLoadMoreResult, type LoadMoreState } from "../lib/feed-pagination";
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

	const [loadMoreState, setLoadMoreState] = useState<LoadMoreState<CircleFeedCardItem>>({
		extraItems: [],
		page: initialPage,
		hasNextPage: initialHasNextPage,
		loadFailed: false,
	});
	const [isLoading, setIsLoading] = useState(false);
	const { extraItems, page, hasNextPage, loadFailed } = loadMoreState;

	// Whenever the first page refetches (e.g. after a follow/unfollow toggle
	// invalidates the query), drop any "load more" pages and reset pagination
	// so the visible list matches the freshly filtered feed.
	useEffect(() => {
		setLoadMoreState({
			extraItems: [],
			page: feedQuery.data.page,
			hasNextPage: feedQuery.data.hasNextPage,
			loadFailed: false,
		});
	}, [feedQuery.data]);

	async function loadMore() {
		if (!hasNextPage || isLoading) {
			return;
		}
		setIsLoading(true);
		try {
			const result = await orpcClient.circle.getMemberFeed({
				organizationId,
				page: page + 1,
				perPage,
			});
			setLoadMoreState((prev) => applyLoadMoreResult(prev, feedQuery.data.items, result));
		} catch {
			// Network/RPC failure — same handling as the server's ok:false fail-safe.
			setLoadMoreState((prev) => ({ ...prev, loadFailed: true }));
		} finally {
			setIsLoading(false);
		}
	}

	const items = [...feedQuery.data.items, ...extraItems];

	return (
		<div>
			<div className="gap-6 md:grid-cols-2 lg:grid-cols-3 grid">
				{items.map((item) => (
					<CircleFeedCard
						key={`${item.spaceId}-${item.id}`}
						item={item}
						basePath={basePath}
					/>
				))}
			</div>
			{hasNextPage ? (
				<div className="mt-10 gap-2 flex flex-col items-center">
					{loadFailed ? (
						<p className="text-sm text-muted-foreground">Couldn’t load more posts.</p>
					) : null}
					<button
						type="button"
						onClick={loadMore}
						disabled={isLoading}
						className="px-6 py-2.5 text-xs tracking-wide rounded-full bg-primary font-mono text-primary-foreground uppercase transition-opacity hover:opacity-90 disabled:opacity-60"
					>
						{isLoading ? "Loading…" : loadFailed ? "Retry" : "Load more"}
					</button>
				</div>
			) : null}
		</div>
	);
}
