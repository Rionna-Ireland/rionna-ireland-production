"use client";

import type { MemberFeedItem } from "@repo/api/modules/circle/lib/parse-post";
import type { MemberFeedResult } from "@repo/api/modules/circle/procedures/get-member-feed";
import type { ListFeedChipsResult } from "@repo/api/modules/community/lib/types";
import { orpcClient } from "@shared/lib/orpc-client";
import { orpc } from "@shared/lib/orpc-query-utils";
import type { InfiniteData } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
	announcementSpaceIdsFromChips,
	chipToFilter,
	emptyKindForChip,
	selectAnnouncements,
} from "../../lib/community/chips";
import {
	applyLike,
	applyVote,
	mapPages,
	reconcileLike,
	reconcilePoll,
} from "../../lib/community/feed-cache";
import { horseSpaceIds } from "../../lib/community/post-meta";
import { feedItemKey } from "../../lib/feed-pagination";
import {
	AnnouncementCards,
	FeaturedCard,
	FeedSkeleton,
	PollCard,
	PostCard,
	StoryCard,
} from "./FeedCards";
import { FeedChips } from "./FeedChips";

interface CommunityFeedProps {
	organizationId: string;
	basePath: string;
	perPage: number;
	marketingUrl: string | undefined;
	/** Server-rendered unfiltered first page and chips; both seed the caches. */
	initialFeed: MemberFeedResult;
	initialChips: ListFeedChipsResult | null;
}

type FeedData = InfiniteData<MemberFeedResult, number>;

export function CommunityFeed({
	organizationId,
	basePath,
	perPage,
	marketingUrl,
	initialFeed,
	initialChips,
}: CommunityFeedProps) {
	const t = useTranslations("app.community");
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState("all");
	const [pendingLikes, setPendingLikes] = useState<ReadonlySet<string>>(new Set());
	const [pendingVotes, setPendingVotes] = useState<ReadonlySet<string>>(new Set());

	const chipsQuery = useQuery({
		...orpc.community.listFeedChips.queryOptions({ input: { organizationId } }),
		initialData: initialChips?.ok ? initialChips : undefined,
		staleTime: 60_000,
	});
	const chips = chipsQuery.data?.chips ?? [];
	const selectedChip = chips.find((chip) => chip.id === selectedId);
	const filter = chipToFilter(selectedChip);
	const unfiltered = Object.keys(filter).length === 0;

	const feedQuery = useInfiniteQuery(
		orpc.circle.getMemberFeed.infiniteOptions({
			input: (page: number) => ({ organizationId, page, perPage, ...filter }),
			initialPageParam: 1,
			// A failed page re-requests itself so "Retry" works; a good page asks for the next.
			getNextPageParam: (last: MemberFeedResult) =>
				!last.ok ? last.page : last.hasNextPage ? last.page + 1 : undefined,
			initialData: unfiltered ? { pages: [initialFeed], pageParams: [1] } : undefined,
			staleTime: 60_000,
		}),
	);

	const pages = feedQuery.data?.pages ?? [];
	const firstPage = pages[0];
	const lastPage = pages[pages.length - 1];
	const loadFailed =
		feedQuery.isFetchNextPageError || (pages.length > 1 && lastPage?.ok === false);
	const items = useMemo(() => {
		const seen = new Set<string>();
		return pages
			.flatMap((p) => p.items)
			.filter((item) => !seen.has(feedItemKey(item)) && seen.add(feedItemKey(item)));
	}, [pages]);
	const announcements = useMemo(
		() => selectAnnouncements(items, announcementSpaceIdsFromChips(chips)),
		[items, chips],
	);
	const horseIds = useMemo(() => horseSpaceIds(chips), [chips]);
	const featured = firstPage?.featured ?? null;

	/** Applies a transform to every cached feed (every filter), returning snapshots for rollback. */
	function patchFeeds(fn: (items: MemberFeedItem[]) => MemberFeedItem[]) {
		const snapshots: [readonly unknown[], FeedData][] = [];
		for (const [key, data] of queryClient.getQueriesData<FeedData>({
			queryKey: orpc.circle.getMemberFeed.key(),
		})) {
			if (!data || !Array.isArray(data.pages)) continue;
			const next = mapPages(data, fn);
			if (next === data) continue;
			snapshots.push([key, data]);
			queryClient.setQueryData(key, next);
		}
		return snapshots;
	}

	function track(set: typeof setPendingLikes, id: string, on: boolean) {
		set((prev) => {
			const next = new Set(prev);
			if (on) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	async function toggleLike(item: MemberFeedItem) {
		if (pendingLikes.has(item.id)) return;
		const liked = !item.isLiked;
		track(setPendingLikes, item.id, true);
		await queryClient.cancelQueries({ queryKey: orpc.circle.getMemberFeed.key() });
		const snapshots = patchFeeds((list) => applyLike(list, item.id, liked));
		try {
			const result = await orpcClient.circle.setPostLike({
				organizationId,
				postId: item.id,
				liked,
				...(item.spaceId ? { spaceId: item.spaceId } : {}),
			});
			if (!result.ok) throw new Error("Post like failed");
			patchFeeds((list) => reconcileLike(list, item.id, result.liked, result.likeCount));
		} catch {
			for (const [key, data] of snapshots) queryClient.setQueryData(key, data);
			void queryClient.invalidateQueries({ queryKey: orpc.circle.getMemberFeed.key() });
		} finally {
			track(setPendingLikes, item.id, false);
		}
	}

	async function vote(pollId: string, optionId: string) {
		if (pendingVotes.has(pollId)) return;
		track(setPendingVotes, pollId, true);
		await queryClient.cancelQueries({ queryKey: orpc.circle.getMemberFeed.key() });
		const snapshots = patchFeeds((list) => applyVote(list, pollId, optionId));
		try {
			const result = await orpcClient.polls.vote({ organizationId, pollId, optionId });
			if (!result.ok) throw new Error(`Vote failed: ${result.reason}`);
			patchFeeds((list) => reconcilePoll(list, result.poll));
		} catch {
			for (const [key, data] of snapshots) queryClient.setQueryData(key, data);
		} finally {
			track(setPendingVotes, pollId, false);
		}
	}

	const unavailable = firstPage?.ok === false;
	const loading = feedQuery.isPending;
	const emptyKind = emptyKindForChip(selectedChip);
	const emptyCopy = {
		default: { title: t("empty.defaultTitle"), body: t("empty.defaultBody") },
		space: {
			title: t("empty.spaceTitle", { name: selectedChip?.label ?? "" }),
			body: t("empty.spaceBody"),
		},
		horses: { title: t("empty.horsesTitle"), body: t("empty.horsesBody") },
		polls: { title: t("empty.pollsTitle"), body: "" },
		stories: { title: t("empty.storiesTitle"), body: "" },
	}[emptyKind];

	const hasRail = announcements.length > 0 || featured !== null;

	return (
		<div className="gap-8 flex flex-col">
			<header className="gap-5 flex flex-col">
				<h1 className="type-display-lg">{t("title")}</h1>
				<FeedChips
					chips={chips}
					selectedId={selectedChip?.id ?? "all"}
					onSelect={setSelectedId}
					label={t("chipsLabel")}
				/>
			</header>

			<div className="gap-8 xl:grid xl:grid-cols-[minmax(0,680px)_320px] xl:items-start xl:justify-center xl:gap-10 flex flex-col">
				{hasRail ? (
					<aside className="gap-4 xl:sticky xl:top-6 xl:col-start-2 xl:row-start-1 flex flex-col">
						{featured ? <FeaturedCard card={featured} basePath={basePath} /> : null}
						<AnnouncementCards announcements={announcements} basePath={basePath} />
					</aside>
				) : null}

				<section
					aria-busy={loading}
					className="gap-4 xl:col-start-1 xl:row-start-1 flex flex-col"
				>
					{loading ? (
						<FeedSkeleton />
					) : unavailable ? (
						<Notice title={t("unavailableTitle")} body={t("unavailableBody")}>
							<button
								type="button"
								onClick={() => void feedQuery.refetch()}
								className="type-label bg-ink px-5 py-2.5 text-white rounded-full"
							>
								{t("retry")}
							</button>
						</Notice>
					) : items.length === 0 ? (
						<Notice title={emptyCopy.title} body={emptyCopy.body} />
					) : (
						items.map((item) =>
							item.kind === "poll" && item.poll ? (
								<PollCard
									key={feedItemKey(item)}
									poll={item.poll}
									pending={pendingVotes.has(item.poll.id)}
									onVote={vote}
								/>
							) : item.kind === "story" && item.story ? (
								<StoryCard
									key={feedItemKey(item)}
									item={item}
									marketingUrl={marketingUrl}
								/>
							) : (
								<PostCard
									key={feedItemKey(item)}
									item={item}
									basePath={basePath}
									horseIds={horseIds}
									likePending={pendingLikes.has(item.id)}
									onToggleLike={toggleLike}
								/>
							),
						)
					)}

					{!loading && !unavailable && (feedQuery.hasNextPage || loadFailed) ? (
						<div className="mt-4 gap-2 flex flex-col items-center">
							{loadFailed ? (
								<p className="text-sm text-ink-variant">{t("loadMoreFailed")}</p>
							) : null}
							<button
								type="button"
								onClick={() => void feedQuery.fetchNextPage()}
								disabled={feedQuery.isFetchingNextPage}
								className="type-label bg-ink px-6 py-2.5 text-white rounded-full transition-opacity hover:opacity-90 disabled:opacity-60"
							>
								{feedQuery.isFetchingNextPage
									? t("loadingMore")
									: loadFailed
										? t("retry")
										: t("loadMore")}
							</button>
						</div>
					) : null}
				</section>
			</div>
		</div>
	);
}

function Notice({
	title,
	body,
	children,
}: {
	title: string;
	body?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="gap-3 border-outline bg-white px-6 py-12 flex flex-col items-center rounded-xl border text-center">
			<h2 className="text-2xl font-medium font-display">{title}</h2>
			{body ? <p className="text-ink-variant">{body}</p> : null}
			{children}
		</div>
	);
}
