import { PinnedStage } from "@shared/components/motion/PinnedStage";
import { PlayWhenVisible } from "@shared/components/motion/PlayWhenVisible";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import Image from "next/image";

import { pickClubMedia } from "./club-media";
import { ClubVideo } from "./ClubVideo";

export function GrowPhoto({
	label,
	index,
	caption,
	photoUrl,
}: {
	label: string;
	index: number;
	caption: string;
	photoUrl?: string | null;
}) {
	const media = pickClubMedia({ photoUrl });
	return (
		<PlayWhenVisible id="club" data-chapter="" data-nav-tone="dark">
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
					{media.kind === "photo" ? (
						<Image
							unoptimized
							src={media.src}
							alt=""
							fill
							sizes="100vw"
							loading="lazy"
							className="object-cover"
						/>
					) : (
						<ClubVideo src={media.src} poster={media.poster} />
					)}
				</div>
				<p className="ch-caption type-display-md mt-6 max-w-5xl text-white mx-auto w-full">
					{caption}
				</p>
			</PinnedStage>
		</PlayWhenVisible>
	);
}
