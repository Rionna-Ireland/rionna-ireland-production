import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import type { JoinCta } from "@shared/lib/join-url";
import { ArrowRightIcon } from "lucide-react";

export function Close({
	eyebrow,
	title,
	ctaLabel,
	joinCta,
}: {
	eyebrow: string;
	title: string;
	ctaLabel: string;
	joinCta: JoinCta;
}) {
	return (
		<section
			id="close"
			data-chapter
			data-nav-tone="dark"
			className="grain bg-plum text-white relative isolate overflow-hidden"
		>
			<PatternMosaic
				colourway="plum"
				columns={12}
				rows={2}
				trigger="view"
				className="relative"
			/>
			<div className="gap-8 py-20 md:py-28 relative container flex flex-col items-start">
				<Reveal>
					<span className="type-label text-lilac">{eyebrow}</span>
				</Reveal>
				<MaskedText
					as="h2"
					text={title}
					className="font-display text-[clamp(3rem,9vw,8rem)] leading-[0.95] tracking-[-0.02em] text-balance"
				/>
				<Reveal delayMs={200}>
					<JoinCtaLink
						cta={joinCta}
						className={`group ${v2Button({ variant: "onDark" })}`}
					>
						{ctaLabel}
						<ArrowRightIcon className="ml-2 size-4 group-hover:translate-x-1 transition-transform duration-(--dur-hover)" />
					</JoinCtaLink>
				</Reveal>
			</div>
		</section>
	);
}
