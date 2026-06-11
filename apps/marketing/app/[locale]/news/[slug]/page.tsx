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

	return (
		<article className="py-16 md:py-24">
			<div className="container max-w-3xl">
				<LocaleLink
					href="/news"
					className="font-mono text-xs tracking-[0.2em] uppercase text-foreground/60 hover:text-foreground"
				>
					&larr; {t("back")}
				</LocaleLink>

				<header className="mt-8">
					<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-foreground/60">
						{post.publishedAt
							? new Intl.DateTimeFormat(activeLocale, {
									day: "2-digit",
									month: "long",
									year: "numeric",
								}).format(new Date(post.publishedAt))
							: ""}
					</span>
					<h1 className="mt-3 font-display font-medium text-4xl md:text-5xl lg:text-6xl leading-tight text-balance">
						{post.title}
					</h1>
					{post.subtitle && (
						<p className="mt-4 text-xl text-foreground/70 leading-relaxed">
							{post.subtitle}
						</p>
					)}
					{post.author?.name && (
						<p className="mt-6 font-mono text-xs tracking-[0.2em] uppercase text-foreground/60">
							{t("byline", { name: post.author.name })}
						</p>
					)}
				</header>
			</div>

			{post.featuredImageUrl && (
				<div className="container max-w-5xl mt-12">
					<div className="aspect-[16/9] relative overflow-hidden rounded-3xl bg-[#DAEDF3]">
						{/* biome-ignore lint/a11y/useAltText: title as alt */}
						<img
							src={post.featuredImageUrl}
							alt={post.title}
							className="absolute inset-0 h-full w-full object-cover"
						/>
					</div>
				</div>
			)}

			<div className="container max-w-3xl mt-12">
				<div
					className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-display prose-headings:font-medium"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised by Novel on save
					dangerouslySetInnerHTML={{ __html: post.contentHtml }}
				/>

				<div className="mt-16 pt-8 border-t gap-4 flex items-center flex-wrap">
					<span className="font-mono text-xs tracking-[0.2em] uppercase text-foreground/60">
						{t("share")}
					</span>
					<a
						href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
						target="_blank"
						rel="noreferrer"
						className="text-sm underline underline-offset-4"
					>
						Twitter
					</a>
					<a
						href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
						target="_blank"
						rel="noreferrer"
						className="text-sm underline underline-offset-4"
					>
						Facebook
					</a>
				</div>
			</div>
		</article>
	);
}
