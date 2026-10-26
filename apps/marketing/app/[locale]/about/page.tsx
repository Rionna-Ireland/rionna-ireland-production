import { Close } from "@about/components/Close";
import { GrowPhoto } from "@about/components/GrowPhoto";
import { Opener } from "@about/components/Opener";
import { People } from "@about/components/People";
import { StoryBeats } from "@about/components/StoryBeats";
import { Values } from "@about/components/Values";
import { ChapterRail } from "@shared/components/motion/ChapterRail";
import { chapterNumbering } from "@shared/components/motion/chapters";
import { getClubOrganization } from "@shared/lib/club";
import { getSiteJoinCta, getWebsiteContent } from "@shared/lib/website";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "about.meta" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

const VALUE_KEYS = ["openGates", "leadWithCare", "findJoy"] as const;

export default async function AboutPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const t = await getTranslations({ locale, namespace: "about" });
	const [club, { content }, joinCta] = await Promise.all([
		getClubOrganization(),
		getWebsiteContent(),
		getSiteJoinCta(),
	]);
	const { about } = content;

	const rawAbout = club.metadata.contact?.aboutText;
	const aboutText = (typeof rawAbout === "string" && rawAbout.trim()) || t("fallbackAbout");

	const chapters = chapterNumbering(about.founders.length > 0).map((c) => ({
		...c,
		label: t(`chapters.${c.id}` as "chapters.story"),
	}));
	const ch = (id: string) => chapters.find((c) => c.id === id);
	const [story, why, club_, people, believe] = ["story", "why", "club", "people", "believe"].map(
		ch,
	);

	return (
		<div className="bg-page">
			<ChapterRail chapters={chapters} />
			{story && (
				<Opener
					label={story.label}
					index={story.index}
					title={about.storyTitle ?? t("title")}
					photoUrl={about.photoUrl}
				/>
			)}
			{why && <StoryBeats text={aboutText} label={why.label} index={why.index} />}
			{club_ && (
				<GrowPhoto
					label={club_.label}
					index={club_.index}
					caption={t("caption")}
					photoUrl={about.photoUrl}
				/>
			)}
			{people && (
				<People founders={about.founders} label={people.label} index={people.index} />
			)}
			{believe && (
				<Values
					label={believe.label}
					index={believe.index}
					cards={VALUE_KEYS.map((key) => ({
						key,
						eyebrow: t(`values.${key}.eyebrow`),
						title: t(`values.${key}.title`),
						description: t(`values.${key}.description`),
					}))}
				/>
			)}
			<Close
				eyebrow={t("close.eyebrow")}
				title={t("close.title")}
				ctaLabel={t("cta")}
				joinCta={joinCta}
			/>
		</div>
	);
}
