import { NewsGrid } from "@news/components/NewsGrid";
import { NewsLead } from "@news/components/NewsLead";
import { NewsOpener } from "@news/components/NewsOpener";
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
			<NewsOpener
				index={1}
				label={t("yard")}
				title={t("heading")}
				intro={t("description")}
				posts={items.slice(0, 6)}
			/>
			{!lead ? (
				<p className="py-20 text-ink-variant container">{t("empty")}</p>
			) : (
				<>
					<NewsLead
						index={2}
						label={t("latest")}
						post={lead}
						date={formatDate(lead.publishedAt)}
						readLabel={t("readStory")}
					/>
					{rest.length > 0 && (
						<NewsGrid
							index={3}
							label={t("more")}
							posts={rest}
							formatDate={formatDate}
						/>
					)}
				</>
			)}
		</div>
	);
}
