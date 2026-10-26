import { LocaleLink } from "@i18n/routing";
import { MediaPlaceholder } from "@shared/components/MediaPlaceholder";
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
		<div data-nav-tone="light" className="under-nav bg-page">
			<div className="gap-10 pb-14 md:pb-[56px] container flex flex-col">
				<div className="max-w-3xl gap-3 flex flex-col">
					<span className="type-label text-ink-variant">{t("eyebrow")}</span>
					<h1 className="type-display-xl text-balance">{t("title")}</h1>
					<p className="text-lg text-ink-variant leading-relaxed">{t("description")}</p>
				</div>

				{!lead ? (
					<p className="text-ink-variant">{t("empty")}</p>
				) : (
					<>
						<LocaleLink
							href={`/news/${lead.slug}`}
							className="group gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center grid hover:no-underline"
						>
							<div className="md:h-[320px] relative h-[240px] overflow-hidden rounded-lg">
								{lead.featuredImageUrl ? (
									// biome-ignore lint/a11y/useAltText: title as alt
									<img
										src={lead.featuredImageUrl}
										alt={lead.title}
										className="inset-0 absolute h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
									/>
								) : (
									<MediaPlaceholder tone="ice" className="h-full" />
								)}
							</div>
							<div className="gap-3 flex flex-col">
								<span className="type-label text-ink-variant">
									{formatDate(lead.publishedAt)}
								</span>
								<h2 className="type-display-lg text-balance">{lead.title}</h2>
								{lead.subtitle && (
									<p className="text-lg text-ink-variant leading-relaxed">
										{lead.subtitle}
									</p>
								)}
							</div>
						</LocaleLink>

						{rest.length > 0 && (
							<div className="gap-6 md:grid-cols-2 lg:grid-cols-3 grid">
								{rest.map((post) => (
									<LocaleLink
										key={post.id}
										href={`/news/${post.slug}`}
										className="group p-4 gap-3 bg-paper border-outline flex flex-col rounded-lg border hover:no-underline"
									>
										<div className="relative aspect-[16/10] overflow-hidden rounded-md">
											{post.featuredImageUrl ? (
												// biome-ignore lint/a11y/useAltText: title as alt
												<img
													src={post.featuredImageUrl}
													alt={post.title}
													className="inset-0 absolute h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
												/>
											) : (
												<MediaPlaceholder tone="lilac" className="h-full" />
											)}
										</div>
										<span className="type-label text-plum">
											{formatDate(post.publishedAt)}
										</span>
										<h2 className="type-display-md">{post.title}</h2>
										{post.subtitle && (
											<p className="text-sm text-ink-variant line-clamp-2">
												{post.subtitle}
											</p>
										)}
									</LocaleLink>
								))}
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
