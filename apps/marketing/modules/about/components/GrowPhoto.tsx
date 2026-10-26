import { PinnedStage } from "@shared/components/motion/PinnedStage";
import { PlayWhenVisible } from "@shared/components/motion/PlayWhenVisible";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternCycle } from "@shared/components/pattern/PatternCycle";
import Image from "next/image";

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
	return (
		<PlayWhenVisible id="club" data-chapter data-nav-tone="dark">
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
					{photoUrl ? (
						<Image
							unoptimized
							src={photoUrl}
							alt=""
							fill
							sizes="100vw"
							loading="lazy"
							className="object-cover"
						/>
					) : (
						<PatternCycle className="size-full" />
					)}
				</div>
				<p className="ch-caption type-display-md mt-6 max-w-5xl text-white mx-auto w-full">
					{caption}
				</p>
			</PinnedStage>
		</PlayWhenVisible>
	);
}
