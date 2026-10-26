import type { Founder } from "@shared/components/FoundersSection";
import { PinnedStage } from "@shared/components/motion/PinnedStage";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import Image from "next/image";

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");

/** Founders as a vertical-scroll-driven horizontal track (native snap row elsewhere). Caller skips it when empty. */
export function People({
	founders,
	label,
	index,
}: {
	founders: Founder[];
	label: string;
	index: number;
}) {
	return (
		<section id="people" data-chapter data-nav-tone="light" className="bg-page">
			<PinnedStage
				wide
				heightSvh={100 + founders.length * 70}
				stageClassName="gap-8 py-16 flex flex-col justify-center"
			>
				<SectionLabel index={index} label={label} className="container" />
				<div className="people-view" role="region" tabIndex={0} aria-label={label}>
					<ul className="people-track gap-5 px-6 flex w-max items-start">
						{founders.map((f, i) => (
							<li
								key={`${f.name}-${i}`}
								className="people-card w-[min(78vw,22rem)] shrink-0 snap-center"
							>
								<div className="bg-lilac-light text-plum text-3xl relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-lg font-mono">
									{f.photoUrl ? (
										<Image
											unoptimized
											src={f.photoUrl}
											alt={f.name}
											fill
											sizes="22rem"
											loading="lazy"
											className="object-cover"
										/>
									) : (
										initials(f.name)
									)}
								</div>
								<h3 className="mt-4 font-display text-[clamp(1.75rem,3vw,2.5rem)] leading-none tracking-[-0.01em]">
									{f.name}
								</h3>
								<span className="type-label text-ink-variant mt-2 block">
									{f.role}
								</span>
								<p className="text-ink-variant mt-3 text-sm">{f.bio}</p>
							</li>
						))}
					</ul>
				</div>
			</PinnedStage>
		</section>
	);
}
