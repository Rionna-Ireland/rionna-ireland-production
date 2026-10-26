import type { NewsTilePost } from "./news-types";
import { NewsCard } from "./NewsCard";

// Asymmetric rhythm of cards: one large, then smaller ones, repeating.
const LAYOUT = [
	{ size: "large", span: "md:col-span-7", offset: "" },
	{ size: "small", span: "md:col-span-5", offset: "md:mt-16" },
	{ size: "small", span: "md:col-span-5", offset: "" },
	{ size: "large", span: "md:col-span-7", offset: "md:mt-16" },
] as const;

export function NewsGrid({
	posts,
	formatDate,
	excerptFallback,
	readLabel,
}: {
	posts: NewsTilePost[];
	formatDate: (value: Date | string | null) => string;
	excerptFallback: string;
	readLabel: string;
}) {
	return (
		<section data-nav-tone="light" className="bg-page">
			<div className="py-14 md:py-24 container">
				<div className="gap-6 md:grid-cols-12 grid grid-cols-1">
					{posts.map((post, i) => {
						const l = LAYOUT[i % LAYOUT.length]!;
						return (
							<NewsCard
								key={post.id}
								post={post}
								size={l.size}
								index={i + 1}
								date={formatDate(post.publishedAt)}
								excerptFallback={excerptFallback}
								readLabel={readLabel}
								className={`${l.span} ${l.offset}`}
							/>
						);
					})}
				</div>
			</div>
		</section>
	);
}
