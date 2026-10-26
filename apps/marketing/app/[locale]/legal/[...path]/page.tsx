import { PostContent } from "@blog/components/PostContent";
import { LocaleLink, localeRedirect } from "@i18n/routing";
import { LegalContent } from "@legal/components/LegalContent";
import { LegalToc } from "@legal/components/LegalToc";
import { getAllLegalPagePaths, getLegalPageByPath } from "@legal/lib/pages";
import { extractToc, parseHeadings } from "@legal/lib/toc";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { ReadingProgress } from "@shared/components/motion/ReadingProgress";
import { Reveal } from "@shared/components/motion/Reveal";
import { getActivePathFromUrlParam } from "@shared/lib/content";
import { isWaitlistOnly } from "@shared/lib/waitlist-mode";
import { getTranslations, setRequestLocale } from "next-intl/server";

export function generateStaticParams() {
	const paths = getAllLegalPagePaths();
	return paths.map((path) => ({ path: [path] }));
}

type Params = {
	path: string;
	locale: string;
};

export async function generateMetadata(props: { params: Promise<Params> }) {
	const { path, locale } = await props.params;
	const activePath = getActivePathFromUrlParam(path);
	const page = await getLegalPageByPath(activePath, { locale });

	return {
		title: page?.title,
		openGraph: {
			title: page?.title,
		},
	};
}

export default async function LegalPage(props: { params: Promise<Params> }) {
	const { path, locale } = await props.params;
	setRequestLocale(locale);

	const activePath = getActivePathFromUrlParam(path);
	const page = await getLegalPageByPath(activePath, { locale });

	if (!page) {
		localeRedirect({ href: "/", locale });
		return;
	}

	const { title, body } = page;
	const t = await getTranslations("waitlist");

	// Waitlist-only mode keeps the original layout untouched.
	if (isWaitlistOnly()) {
		return (
			// Waitlist-only mode: the body is plum, so legal copy sits on the cream
			// estate theme where the prose colours stay readable.
			<div className="theme-estate min-h-svh bg-background text-foreground">
				<div className="max-w-6xl py-16 container">
					{/* S12-09 / D39: no nav in waitlist-only mode, so offer the way back. */}
					<LocaleLink
						href="/"
						className="mb-8 text-sm inline-block text-foreground/60 hover:text-foreground"
					>
						← {t("backHome")}
					</LocaleLink>
					<div className="mb-12 max-w-2xl mx-auto">
						<h1 className="type-display-lg text-center">{title}</h1>
					</div>

					<PostContent content={body} />
				</div>
			</div>
		);
	}

	const tl = await getTranslations("legal");
	const toc = extractToc(parseHeadings(page.content));

	return (
		<div data-nav-tone="light" className="under-nav bg-page [--section-pad:0px]">
			<ReadingProgress />
			<div className="max-w-6xl pb-24 container">
				<MaskedText
					as="h1"
					immediate
					text={title}
					className="type-display-xl max-w-3xl text-balance"
				/>
				{page.updated && (
					<Reveal immediate delayMs={300} className="mt-4">
						<p className="type-label text-ink-muted">
							{tl("lastUpdated")} {page.updated}
						</p>
					</Reveal>
				)}

				<div className="mt-12 gap-12 lg:grid-cols-[14rem_1fr] grid">
					<LegalToc items={toc} title={tl("toc")} />
					<LegalContent content={body} />
				</div>
			</div>
		</div>
	);
}
