import { WaitlistLanding } from "@waitlist/components/WaitlistLanding";
import { sanitizeSource } from "@waitlist/lib/schema";
import { getTranslations, setRequestLocale } from "next-intl/server";

// S12-09: shareable waitlist page (`/waitlist?src=press`). Deliberately NOT
// behind redirectIfWireframeMode: it must work while production is in
// wireframe mode.

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "waitlist.meta" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

export default async function WaitlistPage(props: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ src?: string | string[] }>;
}) {
	const { locale } = await props.params;
	setRequestLocale(locale);

	const { src } = await props.searchParams;
	const source = sanitizeSource(Array.isArray(src) ? src[0] : src) ?? undefined;

	return <WaitlistLanding source={source} />;
}
