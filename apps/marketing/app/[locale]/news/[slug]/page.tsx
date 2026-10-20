import { LocaleLink } from "@i18n/routing";
import { getBaseUrl } from "@shared/lib/base-url";
import { getClubNewsPostBySlug } from "@shared/lib/club";
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

	return (
		<article className="bg-page py-14 md:py-[56px]">
			<div className="max-w-3xl container">
				<LocaleLink
					href="/news"
					className="text-sm text-ink-variant hover:text-ink hover:no-underline"
				>
					&larr; {t("back")}
				</LocaleLink>

				<header className="mt-8 gap-4 flex flex-col">
					<span className="type-label text-ink-variant">{date}</span>
					<h1 className="type-display-xl text-balance">{post.title}</h1>
					{post.subtitle && (
						<p className="text-xl text-ink-variant leading-relaxed">{post.subtitle}</p>
					)}
					{post.author?.name && (
						<p className="type-label text-ink-muted">
							{t("byline", { name: post.author.name })}
						</p>
					)}
				</header>
			</div>

			{post.featuredImageUrl && (
				<div className="max-w-5xl mt-10 container">
					<div className="bg-ice relative aspect-[16/9] overflow-hidden rounded-lg">
						{/* biome-ignore lint/a11y/useAltText: title as alt */}
						<img
							src={post.featuredImageUrl}
							alt={post.title}
							className="inset-0 absolute h-full w-full object-cover"
						/>
					</div>
				</div>
			)}

			<div className="max-w-3xl mt-10 container">
				<div
					className={[
						"prose prose-lg max-w-none text-ink prose-p:text-ink prose-p:leading-relaxed prose-li:text-ink",
						"prose-headings:font-display prose-headings:font-medium prose-headings:text-ink",
						"prose-a:text-plum prose-strong:text-ink",
						"prose-blockquote:not-italic prose-blockquote:border-l-[3px] prose-blockquote:border-plum prose-blockquote:py-1.5 prose-blockquote:pl-7 prose-blockquote:font-normal",
						"prose-blockquote:font-display prose-blockquote:font-light prose-blockquote:italic prose-blockquote:text-[34px] prose-blockquote:leading-[1.22] prose-blockquote:text-plum",
						"[&_blockquote_p]:text-plum [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none",
					].join(" ")}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised by Novel on save
					dangerouslySetInnerHTML={{ __html: post.contentHtml }}
				/>

				<p className="mt-10 text-lg text-ink-variant leading-relaxed">{t("appCta")}</p>

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
		</article>
	);
}
