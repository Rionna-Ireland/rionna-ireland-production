import { NewsCard } from "@news/components/NewsCard";
import { NewsGrid } from "@news/components/NewsGrid";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { getClubNewsPosts } from "@shared/lib/club";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "news.meta" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

export default async function NewsListPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const t = await getTranslations({ locale, namespace: "news" });
	const activeLocale = await getLocale();
	const { items } = await getClubNewsPosts({ limit: 24 });
	const [lead, ...rest] = items;

	const formatDate = (value: Date | string | null) =>
		value
			? new Intl.DateTimeFormat(activeLocale, {
					day: "numeric",
					month: "long",
					year: "numeric",
				}).format(new Date(value))
			: "";

	return (
		<div className="bg-page">
			<section data-nav-tone="light" className="under-nav pb-10 md:pb-14">
				<div className="gap-5 container flex flex-col">
					<MaskedText
						as="h1"
						immediate
						text={t("heading")}
						className="font-display text-[clamp(4rem,12vw,9rem)] leading-[0.95] tracking-[-0.02em]"
					/>
					<Reveal immediate delayMs={300}>
						<p className="max-w-xl text-lg text-ink-variant text-pretty">
							{t("description")}
						</p>
					</Reveal>
				</div>
				{lead && (
					<div className="mt-10 container">
						<NewsCard
							post={lead}
							size="lead"
							index={0}
							immediate
							date={formatDate(lead.publishedAt)}
							excerptFallback={t("excerpt")}
							readLabel={t("read")}
						/>
					</div>
				)}
			</section>
			{!lead && <p className="pb-20 text-ink-variant container">{t("empty")}</p>}
			{rest.length > 0 && (
				<NewsGrid
					posts={rest}
					formatDate={formatDate}
					excerptFallback={t("excerpt")}
					readLabel={t("read")}
				/>
			)}
		</div>
	);
}
