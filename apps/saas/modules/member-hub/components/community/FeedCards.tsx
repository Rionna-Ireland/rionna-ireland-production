"use client";

import type { FeaturedCard as FeaturedCardData } from "@repo/api/modules/circle/lib/featured-qa";
import type { MemberFeedItem } from "@repo/api/modules/circle/lib/parse-post";
import type { PollCardData } from "@repo/api/modules/polls/lib/poll-view";
import { cn } from "@repo/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { percentagesFor } from "../../lib/community/feed-cache";
import {
	SPACE_TAG_CLASS,
	featuredHref,
	formatFeaturedWhen,
	relativeTime,
	roleBadge,
	spaceTagTone,
	storyHref,
} from "../../lib/community/post-meta";

const CARD = "relative rounded-xl border border-outline bg-white p-5 md:p-6";
const TITLE = "font-display text-2xl font-medium leading-tight";
const PILL = "type-label inline-flex max-w-full rounded-[5px] px-2.5 py-1.5";
/** Stretched-link: the title link covers the card; interactive children sit above with z-10. */
const STRETCH =
	"after:absolute after:inset-0 after:content-[''] focus-visible:outline-none after:focus-visible:rounded-xl after:focus-visible:ring-2 after:focus-visible:ring-ring";

function RelativeTime({ value }: { value: string | null }) {
	const t = useTranslations("app.community.time");
	const rel = relativeTime(value);
	if (!rel) return null;
	// Relative to render time, so server and client text can differ by a minute.
	return (
		<span suppressHydrationWarning className="text-sm text-label/70">
			{rel.kind === "date"
				? rel.text
				: rel.kind === "justNow"
					? t("justNow")
					: t(rel.kind, { count: rel.count })}
		</span>
	);
}

function AuthorHeader({ item, horseIds }: { item: MemberFeedItem; horseIds: ReadonlySet<string> }) {
	const t = useTranslations("app.community");
	const name = item.authorName?.trim() || t("anonymousAuthor");
	const badge = roleBadge(item.authorRole, item.authorRoleLabel);
	const spaceName = item.spaceName?.trim();
	return (
		<div className="gap-3 flex items-center">
			<Avatar className="size-10 ring-lilac rounded-full ring-2">
				{item.authorAvatarUrl ? (
					<AvatarImage src={item.authorAvatarUrl} alt="" className="rounded-full" />
				) : null}
				<AvatarFallback className="bg-lilac-light text-plum rounded-full">
					{name.slice(0, 1).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className="gap-2 flex flex-wrap items-center">
					<span className="font-medium text-ink truncate">{name}</span>
					{spaceName ? (
						<span
							className={cn(
								PILL,
								SPACE_TAG_CLASS[spaceTagTone(spaceName, item.spaceId, horseIds)],
							)}
						>
							<span className="truncate">{spaceName}</span>
						</span>
					) : null}
					{badge ? (
						<span className={cn(PILL, "border-outline bg-white text-label border")}>
							{badge.customLabel ?? t(`role.${badge.role}`)}
						</span>
					) : null}
				</div>
				<RelativeTime value={item.createdAt} />
			</div>
		</div>
	);
}

function CardImage({ item }: { item: MemberFeedItem }) {
	return item.imageUrl ? (
		<img
			src={item.imageUrl}
			alt={item.title}
			className="aspect-video bg-cream w-full rounded-md object-cover"
		/>
	) : null;
}

function LikeButton({
	item,
	pending,
	onToggle,
}: {
	item: MemberFeedItem;
	pending: boolean;
	onToggle: () => void;
}) {
	const t = useTranslations("app.community");
	return (
		<button
			type="button"
			aria-pressed={item.isLiked}
			aria-label={t("like")}
			aria-disabled={pending}
			onClick={() => {
				if (!pending) onToggle();
			}}
			className={cn(
				"gap-1.5 py-1 pr-2 text-label hover:text-plum relative z-10 inline-flex items-center rounded-full",
				pending && "opacity-60",
			)}
		>
			<svg
				aria-hidden
				viewBox="0 0 24 24"
				className={cn(
					"size-5",
					item.isLiked ? "fill-plum stroke-plum" : "fill-none stroke-current",
				)}
				strokeWidth="1.5"
			>
				<path
					d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"
					strokeLinejoin="round"
				/>
			</svg>
			<span aria-hidden>{item.likeCount}</span>
			<span className="sr-only">{t("likeCount", { count: item.likeCount })}</span>
		</button>
	);
}

interface PostCardProps {
	item: MemberFeedItem;
	basePath: string;
	horseIds: ReadonlySet<string>;
	likePending: boolean;
	onToggleLike: (item: MemberFeedItem) => void;
}

export function PostCard({ item, basePath, horseIds, likePending, onToggleLike }: PostCardProps) {
	const t = useTranslations("app.community");
	const href = item.spaceId
		? `${basePath}/feed/${encodeURIComponent(item.spaceId)}/${encodeURIComponent(item.id)}`
		: null;
	return (
		<article className={CARD} data-announcement={item.isAnnouncement ? "" : undefined}>
			<div className="gap-3 flex flex-col">
				<AuthorHeader item={item} horseIds={horseIds} />
				{item.title ? (
					<h2 className={TITLE}>
						{href ? (
							<Link href={href} className={STRETCH}>
								{item.title}
							</Link>
						) : (
							item.title
						)}
					</h2>
				) : null}
				{item.excerpt ? (
					<p className="text-lg text-ink-variant line-clamp-3">{item.excerpt}</p>
				) : null}
				<CardImage item={item} />
				<div className="gap-4 flex items-center">
					<LikeButton
						item={item}
						pending={likePending}
						onToggle={() => onToggleLike(item)}
					/>
					<span className="gap-1.5 text-label inline-flex items-center">
						<svg
							aria-hidden
							viewBox="0 0 24 24"
							className="size-5 fill-none stroke-current"
							strokeWidth="1.5"
						>
							<path d="M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z" strokeLinejoin="round" />
						</svg>
						<span aria-hidden>{item.commentCount}</span>
						<span className="sr-only">
							{t("commentCount", { count: item.commentCount })}
						</span>
					</span>
				</div>
			</div>
		</article>
	);
}

export function StoryCard({
	item,
	marketingUrl,
}: {
	item: MemberFeedItem;
	marketingUrl: string | undefined;
}) {
	const t = useTranslations("app.community");
	const href = item.story ? storyHref(item.story.slug, marketingUrl) : null;
	return (
		<article className={CARD}>
			<div className="gap-3 flex flex-col">
				<AuthorHeader item={item} horseIds={new Set()} />
				<h2 className={TITLE}>
					{href ? (
						<a href={href} className={STRETCH}>
							{item.title}
						</a>
					) : (
						item.title
					)}
				</h2>
				{item.excerpt ? (
					<p className="text-lg text-ink-variant line-clamp-3">{item.excerpt}</p>
				) : null}
				<CardImage item={item} />
				{href ? <span className="type-label text-plum">{t("readStory")}</span> : null}
			</div>
		</article>
	);
}

export function PollCard({
	poll,
	pending,
	onVote,
}: {
	poll: PollCardData;
	pending: boolean;
	onVote: (pollId: string, optionId: string) => void;
}) {
	const t = useTranslations("app.community.poll");
	const closed = poll.status === "closed";
	const canVote = !closed && !pending;
	const results = poll.results;
	const percents = results ? percentagesFor(poll.options, results) : null;
	const eyebrow = closed ? t("closed") : poll.scope === "space" ? t("stableVote") : t("clubVote");
	const titleId = `poll-${poll.id}`;
	return (
		<article className={CARD}>
			<div className="gap-4 flex flex-col">
				<div className="gap-2 flex flex-col">
					<span className="type-label text-label">{eyebrow}</span>
					<h2 id={titleId} className={TITLE}>
						{poll.question}
					</h2>
				</div>
				<div role="group" aria-labelledby={titleId} className="gap-3 flex flex-col">
					{poll.options.map((option) => {
						const mine = poll.myVoteOptionId === option.id;
						const percent = percents?.[option.id] ?? 0;
						return (
							<button
								key={option.id}
								type="button"
								aria-pressed={mine}
								aria-disabled={!canVote}
								onClick={() => {
									if (canVote) onVote(poll.id, option.id);
								}}
								className={cn(
									"gap-3 p-3 relative flex items-center justify-between overflow-hidden rounded-lg border text-left aria-disabled:cursor-default",
									mine ? "border-plum" : "border-outline",
									canVote && "hover:border-plum",
								)}
							>
								{percents ? (
									<span
										aria-hidden
										className={cn(
											"inset-y-0 left-0 absolute",
											mine ? "bg-lilac" : "bg-lilac-light",
										)}
										style={{ width: `${percent}%` }}
									/>
								) : null}
								<span className={cn("relative", mine && "font-semibold")}>
									{option.label}
								</span>
								{percents ? (
									<span className="text-label relative">
										{t("percent", { percent })}
									</span>
								) : null}
							</button>
						);
					})}
				</div>
				<p aria-live="polite" className="text-sm text-ink-variant">
					{pending
						? t("saving")
						: results
							? t("votes", { count: results.total })
							: t("hint")}
				</p>
			</div>
		</article>
	);
}

export function AnnouncementCards({
	announcements,
	basePath,
}: {
	announcements: MemberFeedItem[];
	basePath: string;
}) {
	const t = useTranslations("app.community");
	if (announcements.length === 0) return null;
	return (
		<ul className="gap-4 md:grid-cols-2 xl:grid-cols-1 grid">
			{announcements.map((item) => (
				<li
					key={item.id}
					className="min-h-44 gap-6 bg-ink p-6 text-white relative flex flex-col justify-between rounded-xl"
				>
					<div className="gap-3 flex flex-col">
						<span className="type-label text-white/80">{t("announcementKicker")}</span>
						<h2 className={cn(TITLE, "line-clamp-4")}>{item.title}</h2>
					</div>
					<Link
						href={`${basePath}/feed/${encodeURIComponent(item.spaceId as string)}/${encodeURIComponent(item.id)}`}
						aria-label={t("announcementReadA11y", { title: item.title })}
						className={cn(
							STRETCH,
							"type-label bg-white px-4 py-2 text-ink self-start rounded-full",
						)}
					>
						{t("announcementRead")}
					</Link>
				</li>
			))}
		</ul>
	);
}

export function FeaturedCard({ card, basePath }: { card: FeaturedCardData; basePath: string }) {
	const t = useTranslations("app.community");
	const when = formatFeaturedWhen(card.startsAt);
	const href = featuredHref(basePath, card);
	const kicker = when ? t("featuredKicker", { when }) : t("featuredKickerNoDate");
	return (
		<div className="gap-1 border-outline bg-cream p-5 relative flex flex-col rounded-xl border">
			<span className="type-label text-label">{kicker}</span>
			<h2 className={TITLE}>
				{href ? (
					<Link href={href} className={STRETCH}>
						{card.title}
					</Link>
				) : (
					card.title
				)}
			</h2>
			{card.cta ? <p className="text-sm text-ink-variant">{card.cta}</p> : null}
		</div>
	);
}

export function FeedSkeleton() {
	return (
		<div aria-hidden className="gap-4 flex flex-col">
			{[0, 1, 2].map((i) => (
				<div key={i} className={cn(CARD, "h-44 bg-cream/60 motion-safe:animate-pulse")} />
			))}
		</div>
	);
}
