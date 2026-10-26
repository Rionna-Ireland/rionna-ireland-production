import { LocaleLink } from "@i18n/routing";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { PinnedStage } from "@shared/components/motion/PinnedStage";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import Image from "next/image";

import type { NewsTilePost } from "./news-types";

/** The lead story's photo pins and grows to full-bleed (About's `.ch-photo` technique), headline masked over it. */
export function NewsLead({
	index,
	label,
	post,
	date,
	readLabel,
}: {
	index: number;
	label: string;
	post: NewsTilePost;
	date: string;
	readLabel: string;
}) {
	return (
		<section data-nav-tone="dark">
			<PinnedStage
				heightSvh={240}
				stageClassName="bg-plum relative isolate flex flex-col justify-center overflow-hidden px-6 py-16"
			>
				<div
					aria-hidden="true"
					className="texture-p7 ch-frame inset-0 absolute -z-10 [--texture-opacity:0.5]"
				/>
				<SectionLabel
					index={index}
					label={label}
					className="ch-label text-lilac mb-6 self-center"
				/>
				<div className="ch-photo max-w-5xl relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-lg">
					{post.featuredImageUrl ? (
						<Image
							unoptimized
							src={post.featuredImageUrl}
							alt=""
							fill
							sizes="100vw"
							loading="lazy"
							className="object-cover"
						/>
					) : (
						<PatternMosaic
							colourway="plum"
							kind="harlequin"
							columns={6}
							rows={14}
							className="size-full"
						/>
					)}
				</div>
				<div className="ch-caption mt-6 max-w-5xl gap-4 text-white mx-auto flex w-full flex-col items-start">
					<span className="type-label text-lilac">{date}</span>
					<MaskedText
						as="h2"
						text={post.title}
						className="type-display-lg text-balance"
					/>
					<LocaleLink
						href={`/news/${post.slug}`}
						className={v2Button({ variant: "onDark" })}
					>
						{readLabel}
					</LocaleLink>
				</div>
			</PinnedStage>
		</section>
	);
}
