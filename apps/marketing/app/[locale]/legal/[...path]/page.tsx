import { PostContent } from "@blog/components/PostContent";
import { LocaleLink, localeRedirect } from "@i18n/routing";
import { getAllLegalPagePaths, getLegalPageByPath } from "@legal/lib/pages";
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

	return (
		<div className="max-w-6xl py-16 container">
			{/* S12-09 / D39: no nav in waitlist-only mode, so offer the way back. */}
			{isWaitlistOnly() && (
				<LocaleLink
					href="/"
					className="mb-8 text-sm inline-block text-foreground/60 hover:text-foreground"
				>
					← {t("backHome")}
				</LocaleLink>
			)}
			<div className="mb-12 max-w-2xl mx-auto">
				<h1 className="font-bold text-4xl text-center">{title}</h1>
			</div>

			<PostContent content={body} />
		</div>
	);
}
