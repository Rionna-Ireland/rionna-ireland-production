import { LocaleLink } from "@i18n/routing";
import { cn } from "@repo/ui";
import { PhotoUnmask } from "@shared/components/motion/PhotoUnmask";
import { Reveal } from "@shared/components/motion/Reveal";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import Image from "next/image";

import { type NewsTilePost, placeholderFor } from "./news-types";

// Alternating large and small tiles; the small ones sit lower for an asymmetric rhythm.
const TILES = [
	{ span: "md:col-span-7", aspect: "aspect-[4/3]", offset: "" },
	{ span: "md:col-span-5", aspect: "aspect-[4/5]", offset: "md:mt-24" },
	{ span: "md:col-span-5", aspect: "aspect-[4/5]", offset: "" },
	{ span: "md:col-span-7", aspect: "aspect-[4/3]", offset: "md:mt-24" },
];

export function NewsGrid({
	index,
	label,
	posts,
	formatDate,
}: {
	index: number;
	label: string;
	posts: NewsTilePost[];
	formatDate: (value: Date | string | null) => string;
}) {
	return (
		<section data-nav-tone="light" className="bg-page">
			<PatternMosaic
				colourway="lilac"
				kind="quad"
				columns={16}
				rows={1}
				trigger="view"
				className="opacity-80"
			/>
			<div className="py-14 md:py-24 container">
				<Reveal className="mb-10">
					<SectionLabel index={index} label={label} />
				</Reveal>
				<div className="gap-x-6 gap-y-14 md:grid-cols-12 grid grid-cols-1">
					{posts.map((post, i) => {
						const tile = TILES[i % TILES.length]!;
						const ph = placeholderFor(i + 1);
						return (
							<LocaleLink
								key={post.id}
								href={`/news/${post.slug}`}
								className={cn(
									"tile group gap-4 flex flex-col hover:no-underline",
									tile.span,
									tile.offset,
								)}
							>
								<PhotoUnmask
									direction={i % 2 ? "left" : "up"}
									className={cn("photo-zoom relative rounded-lg", tile.aspect)}
								>
									<div className="drift inset-x-0 absolute -inset-y-[7%]">
										{post.featuredImageUrl ? (
											<Image
												unoptimized
												src={post.featuredImageUrl}
												alt={post.title}
												fill
												sizes="(min-width: 768px) 60vw, 100vw"
												loading="lazy"
												className="object-cover"
											/>
										) : (
											<PatternMosaic
												colourway={ph.colourway}
												kind={ph.kind}
												columns={4}
												rows={6}
												trigger="view"
												className="size-full"
											/>
										)}
									</div>
								</PhotoUnmask>
								<span className="type-label text-plum">
									{formatDate(post.publishedAt)}
								</span>
								<h3 className="type-display-md text-balance">
									<span className="link-draw">{post.title}</span>
								</h3>
								{post.subtitle && (
									<p className="text-sm text-ink-variant line-clamp-2">
										{post.subtitle}
									</p>
								)}
							</LocaleLink>
						);
					})}
				</div>
			</div>
		</section>
	);
}
