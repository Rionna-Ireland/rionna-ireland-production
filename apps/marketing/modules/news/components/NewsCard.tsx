import { LocaleLink } from "@i18n/routing";
import { cn } from "@repo/ui";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { PhotoUnmask } from "@shared/components/motion/PhotoUnmask";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import Image from "next/image";

import { type NewsTilePost, placeholderFor } from "./news-types";

const SIZES = {
	lead: { aspect: "aspect-[4/3] md:aspect-[16/7]", title: "type-display-xl" },
	// Masonry rhythm: image ratio varies by position.
	masonry: ["aspect-[4/5]", "aspect-square", "aspect-[3/2]"],
} as const;

/** One news item as a contained card: the whole card is a single link. */
export function NewsCard({
	post,
	size,
	index,
	date,
	excerptFallback,
	readLabel,
	immediate,
	className,
}: {
	post: NewsTilePost;
	size: "lead" | "masonry";
	index: number;
	date: string;
	excerptFallback: string;
	readLabel: string;
	/** Above the fold: the photo wipes at page time. */
	immediate?: boolean;
	className?: string;
}) {
	const aspect = size === "lead" ? SIZES.lead.aspect : SIZES.masonry[index % 3];
	const titleClass = size === "lead" ? SIZES.lead.title : "type-display-md";
	const ph = placeholderFor(index);
	return (
		<LocaleLink
			href={`/news/${post.slug}`}
			className={cn(
				"tile card-lift group bg-white border-outline gap-5 flex break-inside-avoid flex-col overflow-hidden rounded-lg border hover:no-underline hover:shadow-[0_12px_32px_-16px_rgb(23_39_65/0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
				className,
			)}
		>
			<PhotoUnmask
				immediate={immediate}
				direction={index % 2 ? "left" : "up"}
				className={cn("photo-zoom relative", aspect)}
			>
				<div className="inset-0 absolute">
					{post.featuredImageUrl ? (
						<Image
							unoptimized
							src={post.featuredImageUrl}
							alt=""
							fill
							sizes="(min-width: 768px) 60vw, 100vw"
							loading={immediate ? "eager" : "lazy"}
							className="object-cover"
						/>
					) : (
						<PatternMosaic
							colourway={ph.colourway}
							kind={ph.kind}
							columns={6}
							rows={9}
							trigger={immediate ? "load" : "view"}
							className="size-full"
						/>
					)}
				</div>
			</PhotoUnmask>
			<div className="px-5 pb-5 gap-3 flex flex-1 flex-col">
				<span className="type-label text-plum">{date}</span>
				{immediate ? (
					<MaskedText
						as="h2"
						immediate
						text={post.title}
						className={cn(titleClass, "text-balance")}
					/>
				) : (
					<h3 className={cn(titleClass, "text-balance")}>
						<span className="link-draw">{post.title}</span>
					</h3>
				)}
				<p className="text-ink-variant text-sm md:text-base line-clamp-3">
					{post.subtitle || excerptFallback}
				</p>
				<span className="type-label text-ink pt-2 gap-2 mt-auto inline-flex items-center">
					{readLabel}
					<span
						aria-hidden="true"
						className="group-hover:translate-x-1 transition-transform duration-300"
					>
						→
					</span>
				</span>
			</div>
		</LocaleLink>
	);
}
