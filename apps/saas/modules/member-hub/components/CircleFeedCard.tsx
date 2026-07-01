import Link from "next/link";

import { formatFeedDate } from "../lib/feed-format";

export interface CircleFeedCardItem {
	id: string;
	spaceId: string | null;
	title: string;
	excerpt: string | null;
	createdAt: string | null;
	spaceName: string | null;
	authorName: string | null;
	imageUrl: string | null;
}

interface CircleFeedCardProps {
	item: CircleFeedCardItem;
	/** Absolute org base, e.g. "/pink-connections". */
	basePath: string;
}

export function CircleFeedCard({ item, basePath }: CircleFeedCardProps) {
	const href = item.spaceId ? `${basePath}/feed/${item.spaceId}/${item.id}` : `${basePath}/feed`;
	const meta = [item.spaceName, formatFeedDate(item.createdAt)].filter(Boolean).join(" · ");

	return (
		<Link
			href={href}
			className="group block overflow-hidden rounded-2xl bg-card shadow-sm transition-shadow hover:no-underline hover:shadow-md"
		>
			{item.imageUrl ? (
				<div className="relative aspect-[16/9] overflow-hidden bg-secondary">
					{/* biome-ignore lint/a11y/useAltText: title used as alt */}
					<img
						src={item.imageUrl}
						alt={item.title}
						className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
					/>
				</div>
			) : null}
			<div className="p-5">
				{meta ? (
					<span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
						{meta}
					</span>
				) : null}
				<h3 className="mt-2 font-display text-xl leading-tight text-foreground">{item.title}</h3>
				{item.excerpt ? (
					<p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{item.excerpt}</p>
				) : null}
				{item.authorName ? (
					<p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
						{item.authorName}
					</p>
				) : null}
			</div>
		</Link>
	);
}
