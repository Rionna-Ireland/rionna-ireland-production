import { LocaleLink } from "@i18n/routing";
import { getClubNewsPosts } from "@shared/lib/club";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "news" });
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

	return (
		<div className="container py-16 md:py-24">
			<div className="max-w-3xl mb-16">
				<span className="font-mono text-xs tracking-[0.22em] uppercase text-foreground/70">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 font-display font-medium text-5xl md:text-6xl lg:text-7xl leading-tight">
					{t("title")}
				</h1>
				<p className="mt-4 text-lg text-foreground/70">{t("description")}</p>
			</div>

			{items.length === 0 ? (
				<p className="text-foreground/60">{t("empty")}</p>
			) : (
				<div className="gap-6 md:grid-cols-2 lg:grid-cols-3 grid">
					{items.map((post) => (
						<LocaleLink
							key={post.id}
							href={`/news/${post.slug}`}
							className="group block overflow-hidden rounded-3xl border bg-card hover:no-underline"
						>
							<div className="aspect-[16/10] relative overflow-hidden bg-[#DAEDF3]">
								{post.featuredImageUrl ? (
									// biome-ignore lint/a11y/useAltText: title as alt
									<img
										src={post.featuredImageUrl}
										alt={post.title}
										className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
									/>
								) : (
									<div className="absolute inset-0 flex items-center justify-center font-display text-6xl text-foreground/10">
										R
									</div>
								)}
							</div>
							<div className="p-6">
								<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/60">
									{post.publishedAt
										? new Intl.DateTimeFormat(activeLocale, {
												day: "2-digit",
												month: "short",
												year: "numeric",
											}).format(new Date(post.publishedAt))
										: ""}
								</span>
								<h2 className="mt-2 font-display font-medium text-2xl leading-tight">
									{post.title}
								</h2>
								{post.subtitle && (
									<p className="mt-2 text-sm text-foreground/60 line-clamp-2">
										{post.subtitle}
									</p>
								)}
							</div>
						</LocaleLink>
					))}
				</div>
			)}
		</div>
	);
}
