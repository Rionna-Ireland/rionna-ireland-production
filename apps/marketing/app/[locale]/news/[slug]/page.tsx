import { LocaleLink } from "@i18n/routing";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { PhotoUnmask } from "@shared/components/motion/PhotoUnmask";
import { ReadingProgress } from "@shared/components/motion/ReadingProgress";
import { Reveal } from "@shared/components/motion/Reveal";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
import { v2Button } from "@shared/components/ui/v2";
import { getBaseUrl } from "@shared/lib/base-url";
import { getClubNewsPostBySlug } from "@shared/lib/club";
import { getSiteJoinCta } from "@shared/lib/website";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

type Params = {
	slug: string;
	locale: string;
};

export async function generateMetadata(props: { params: Promise<Params> }) {
	const { slug, locale } = await props.params;
	const post = await getClubNewsPostBySlug(slug);

	if (!post) {
		return { title: "News" };
	}

	const title = post.title;
	const description = post.subtitle ?? undefined;
	const image = post.featuredImageUrl
		? post.featuredImageUrl.startsWith("http")
			? post.featuredImageUrl
			: new URL(post.featuredImageUrl, getBaseUrl()).toString()
		: undefined;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "article",
			images: image ? [image] : [],
			locale,
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: image ? [image] : [],
		},
	};
}

export default async function NewsDetailPage(props: { params: Promise<Params> }) {
	const { slug, locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const t = await getTranslations({ locale, namespace: "news" });
	const activeLocale = await getLocale();
	const post = await getClubNewsPostBySlug(slug);

	if (!post) {
		notFound();
	}

	const shareUrl = `${getBaseUrl()}/${locale}/news/${post.slug}`;
	const encodedUrl = encodeURIComponent(shareUrl);
	const encodedTitle = encodeURIComponent(post.title);

	const date = post.publishedAt
		? new Intl.DateTimeFormat(activeLocale, {
				day: "numeric",
				month: "long",
				year: "numeric",
			}).format(new Date(post.publishedAt))
		: "";

	const tRoot = await getTranslations({ locale });
	const joinCta = await getSiteJoinCta();

	// One content column: title, byline, hero image and body all share this width.
	const column = "max-w-4xl container";

	return (
		<article data-nav-tone="light" className="bg-page">
			<ReadingProgress />
			<div className="under-nav">
				<div className={column}>
					<Reveal immediate>
						<LocaleLink
							href="/news"
							className="text-sm text-ink-variant hover:text-ink hover:no-underline"
						>
							&larr; {t("back")}
						</LocaleLink>
					</Reveal>

					<header className="mt-8 gap-4 flex flex-col">
						<Reveal immediate delayMs={100}>
							<span className="type-label text-plum">{date}</span>
						</Reveal>
						<MaskedText
							as="h1"
							immediate
							text={post.title}
							className="type-display-xl text-balance"
						/>
						{post.subtitle && (
							<Reveal immediate delayMs={400}>
								<p className="text-xl text-ink-variant leading-relaxed">
									{post.subtitle}
								</p>
							</Reveal>
						)}
						{post.author?.name && (
							<Reveal immediate delayMs={500}>
								<p className="type-label text-ink-muted">
									{t("byline", { name: post.author.name })}
								</p>
							</Reveal>
						)}
					</header>
				</div>

				<div className={`${column} mt-10`}>
					{post.featuredImageUrl ? (
						<PhotoUnmask immediate direction="up" className="rounded-lg">
							<div className="bg-ice relative aspect-[16/9] overflow-hidden rounded-lg">
								{/* biome-ignore lint/a11y/useAltText: title as alt */}
								<img
									src={post.featuredImageUrl}
									alt={post.title}
									className="inset-0 absolute h-full w-full object-cover"
								/>
							</div>
						</PhotoUnmask>
					) : null}
				</div>
			</div>

			<div className={`${column} mt-12`}>
				<PatternMosaic
					colourway="lilac"
					kind="quad"
					columns={16}
					rows={1}
					trigger="view"
					className="mb-12 rounded-lg"
				/>
				<div
					className={[
						"article-body drop-cap prose max-w-none text-ink prose-p:text-ink prose-li:text-ink",
						"prose-p:text-[17px] prose-p:leading-[1.75] lg:prose-p:text-[19px] lg:prose-p:leading-8",
						"prose-li:text-[17px] lg:prose-li:text-[19px]",
						"prose-headings:font-display prose-headings:font-medium prose-headings:text-ink",
						"prose-a:text-plum prose-strong:text-ink prose-img:rounded-lg",
						"prose-blockquote:py-1.5 prose-blockquote:pl-7",
						"prose-blockquote:font-display prose-blockquote:font-light prose-blockquote:italic prose-blockquote:text-[34px] prose-blockquote:leading-[1.22] prose-blockquote:text-plum",
						"[&_blockquote_p]:text-plum [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none",
					].join(" ")}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised by Novel on save
					dangerouslySetInnerHTML={{ __html: post.contentHtml }}
				/>

				<div className="mt-10 pt-6 border-outline gap-4 flex flex-wrap items-center border-t">
					<span className="type-label text-ink-variant">{t("share")}</span>
					<a
						href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
						target="_blank"
						rel="noreferrer"
						className="text-sm text-plum underline underline-offset-4"
					>
						Twitter
					</a>
					<a
						href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
						target="_blank"
						rel="noreferrer"
						className="text-sm text-plum underline underline-offset-4"
					>
						Facebook
					</a>
				</div>
			</div>

			<section
				data-nav-tone="dark"
				className="grain bg-plum mt-16 md:mt-24 py-16 text-white md:py-24 relative isolate overflow-hidden"
			>
				<div className="gap-6 container flex flex-wrap items-center justify-between">
					<Reveal as="p" className="type-display-lg max-w-xl text-balance">
						{t("appCta")}
					</Reveal>
					<JoinCtaLink cta={joinCta} className={v2Button({ variant: "onDark" })}>
						{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("joinCta")}
					</JoinCtaLink>
				</div>
			</section>
		</article>
	);
}
