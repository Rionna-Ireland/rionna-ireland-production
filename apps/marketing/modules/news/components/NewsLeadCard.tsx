import { LocaleLink } from "@i18n/routing";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { PhotoUnmask } from "@shared/components/motion/PhotoUnmask";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import Image from "next/image";

import type { NewsTilePost } from "./news-types";

/** The lead story: a large full-width card that simply unmasks. */
export function NewsLeadCard({
	post,
	date,
	readLabel,
}: {
	post: NewsTilePost;
	date: string;
	readLabel: string;
}) {
	return (
		<PhotoUnmask immediate direction="up" className="rounded-lg">
			<div className="bg-plum md:aspect-[16/8] relative aspect-[4/5] overflow-hidden rounded-lg">
				{post.featuredImageUrl ? (
					<Image
						unoptimized
						src={post.featuredImageUrl}
						alt=""
						fill
						sizes="100vw"
						className="object-cover"
					/>
				) : (
					<PatternMosaic
						colourway="plum"
						kind="harlequin"
						columns={8}
						rows={8}
						className="size-full"
					/>
				)}
				<div aria-hidden="true" className="bg-photo-scrim inset-0 absolute" />
				<div className="inset-x-0 bottom-0 gap-4 p-6 md:p-10 text-white absolute flex flex-col items-start">
					<span className="type-label text-lilac">{date}</span>
					<MaskedText
						as="h2"
						immediate
						text={post.title}
						className="type-display-xl max-w-3xl text-balance"
					/>
					<LocaleLink
						href={`/news/${post.slug}`}
						className={v2Button({ variant: "onDark" })}
					>
						{readLabel}
					</LocaleLink>
				</div>
			</div>
		</PhotoUnmask>
	);
}
