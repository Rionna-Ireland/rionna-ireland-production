"use client";

import type { MemberFeedItem } from "@repo/api/modules/circle/lib/parse-post";
import type { MemberFeedResult } from "@repo/api/modules/circle/procedures/get-member-feed";
import type { ListFeedChipsResult } from "@repo/api/modules/community/lib/types";
import { toastError } from "@repo/ui/components/toast";
import { orpcClient } from "@shared/lib/orpc-client";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";

import {
	announcementSpaceIdsFromChips,
	chipToFilter,
	emptyKindForChip,
	selectAnnouncements,
} from "../../lib/community/chips";
import {
	applyLike,
	applyVote,
	optimisticFeedUpdate,
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

	const feedKey = orpc.circle.getMemberFeed.key();
	const likesInFlight = useRef(new Set<string>());
	const votesInFlight = useRef(new Set<string>());

	/** Failed writes roll back that item only, then refetch for the truth and say so quietly. */
	function onFailed(message: string) {
		void queryClient.invalidateQueries({ queryKey: feedKey });
		toastError(message);
	}

	async function toggleLike(item: MemberFeedItem) {
		const liked = !item.isLiked;
		const outcome = await optimisticFeedUpdate({
			qc: queryClient,
			queryKey: feedKey,
			pending: likesInFlight.current,
			notify: () => setPendingLikes(new Set(likesInFlight.current)),
			id: item.id,
			apply: (list) => applyLike(list, item.id, liked),
			rollback: (list) => applyLike(list, item.id, item.isLiked),
			send: async () => {
				const result = await orpcClient.circle.setPostLike({
					organizationId,
					postId: item.id,
					liked,
					...(item.spaceId ? { spaceId: item.spaceId } : {}),
				});
				if (!result.ok) throw new Error("Post like failed");
				return result;
			},
			reconcile: (result) => (list) =>
				reconcileLike(list, item.id, result.liked, result.likeCount),
		});
		if (outcome === "failed") onFailed(t("likeFailed"));
	}

	async function vote(pollId: string, optionId: string) {
		const previous = items.find((i) => i.poll?.id === pollId)?.poll?.myVoteOptionId ?? null;
		const outcome = await optimisticFeedUpdate({
			qc: queryClient,
			queryKey: feedKey,
			pending: votesInFlight.current,
			notify: () => setPendingVotes(new Set(votesInFlight.current)),
			id: pollId,
			apply: (list) => applyVote(list, pollId, optionId),
			rollback: (list) => applyVote(list, pollId, previous),
			send: async () => {
				const result = await orpcClient.polls.vote({ organizationId, pollId, optionId });
				if (!result.ok) throw new Error(`Vote failed: ${result.reason}`);
				return result;
			},
			reconcile: (result) => (list) => reconcilePoll(list, result.poll),
		});
		if (outcome === "failed") onFailed(t("voteFailed"));
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
						items.map((item) => {
							const key = feedItemKey(item);
							// A poll or story missing its payload has nothing to show; skip it rather than fake a post.
							if (item.kind === "poll")
								return item.poll ? (
									<PollCard
										key={key}
										poll={item.poll}
										pending={pendingVotes.has(item.poll.id)}
										onVote={vote}
									/>
								) : null;
							if (item.kind === "story")
								return item.story ? (
									<StoryCard key={key} item={item} marketingUrl={marketingUrl} />
								) : null;
							return (
								<PostCard
									key={key}
									item={item}
									basePath={basePath}
									horseIds={horseIds}
									likePending={pendingLikes.has(item.id)}
									onToggleLike={toggleLike}
								/>
							);
						})
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

				{hasRail ? (
					<aside className="gap-4 xl:order-none xl:sticky xl:top-6 xl:col-start-2 xl:row-start-1 order-first flex flex-col">
						{featured ? <FeaturedCard card={featured} basePath={basePath} /> : null}
						<AnnouncementCards announcements={announcements} basePath={basePath} />
					</aside>
				) : null}
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
