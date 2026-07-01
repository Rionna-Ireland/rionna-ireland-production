"use client";

import { orpcClient } from "@shared/lib/orpc-client";
import { useState } from "react";

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
	const [items, setItems] = useState<CircleFeedCardItem[]>(initialItems);
	const [page, setPage] = useState(initialPage);
	const [hasNextPage, setHasNextPage] = useState(initialHasNextPage);
	const [isLoading, setIsLoading] = useState(false);

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
			setItems((prev) => [...prev, ...result.items]);
			setPage(result.page);
			setHasNextPage(result.hasNextPage);
		} finally {
			setIsLoading(false);
		}
	}

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
