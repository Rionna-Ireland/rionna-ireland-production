import type { NewsTilePost } from "./news-types";
import { NewsCard } from "./NewsCard";

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
				<div className="gap-6 md:columns-2 lg:columns-3 columns-1">
					{posts.map((post, i) => (
						<NewsCard
							key={post.id}
							post={post}
							size="masonry"
							index={i}
							date={formatDate(post.publishedAt)}
							excerptFallback={excerptFallback}
							readLabel={readLabel}
							className="mb-6"
						/>
					))}
				</div>
			</div>
		</section>
	);
}
