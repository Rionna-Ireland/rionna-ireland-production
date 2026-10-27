import { LocaleLink } from "@i18n/routing";
import { Reveal } from "@shared/components/motion/Reveal";
import { getClubOrganization } from "@shared/lib/club";
import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function AboutTeaserSection() {
	const [t, tAbout, org] = await Promise.all([
		getTranslations("home.aboutTeaser"),
		getTranslations("about"),
		getClubOrganization().catch(() => null),
	]);
	const aboutText = org?.metadata?.contact?.aboutText;
	const text = (typeof aboutText === "string" && aboutText.trim()) || tAbout("fallbackAbout");
	const firstParagraph = text.split(/\n\s*\n/)[0] ?? text;
	const statement = firstParagraph.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] ?? firstParagraph;

	return (
		<section className="gap-8 py-24 md:py-32 container flex flex-col">
			<Reveal>
				<span className="type-label text-plum">{t("eyebrow")}</span>
			</Reveal>
			{/* Each word fills ink-muted to ink as it scrolls through (CSS view timeline, static ink elsewhere). */}
			<p className="max-w-5xl text-ink font-display text-[clamp(2rem,5.4vw,4.75rem)] leading-[1.08] tracking-[-0.015em]">
				{statement
					.split(/\s+/)
					.filter(Boolean)
					.map((word, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static word list
						<span key={`${i}:${word}`} className="fill-word">
							{word}{" "}
						</span>
					))}
			</p>
			<Reveal>
				<LocaleLink
					href="/about"
					className="group gap-2 font-semibold text-ink inline-flex items-center"
				>
					<span className="link-draw">{t("more")}</span>
					<ArrowRightIcon className="size-4 group-hover:translate-x-1 transition-transform duration-(--dur-hover)" />
				</LocaleLink>
			</Reveal>
		</section>
	);
}
