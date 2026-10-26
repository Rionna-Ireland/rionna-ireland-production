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
			className="group hover:shadow-md block overflow-hidden rounded-xl border bg-card transition-shadow hover:no-underline"
		>
			{item.imageUrl ? (
				<div className="relative aspect-[16/9] overflow-hidden bg-secondary">
					{/* biome-ignore lint/a11y/useAltText: title used as alt */}
					<img
						src={item.imageUrl}
						alt={item.title}
						className="inset-0 absolute h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
					/>
				</div>
			) : null}
			<div className="p-5">
				{meta ? (
					<span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
						{meta}
					</span>
				) : null}
				<h3 className="mt-2 text-xl leading-tight font-display text-foreground">
					{item.title}
				</h3>
				{item.excerpt ? (
					<p className="mt-2 text-sm line-clamp-3 text-muted-foreground">
						{item.excerpt}
					</p>
				) : null}
				{item.authorName ? (
					<p className="mt-3 font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
						{item.authorName}
					</p>
				) : null}
			</div>
		</Link>
	);
}
