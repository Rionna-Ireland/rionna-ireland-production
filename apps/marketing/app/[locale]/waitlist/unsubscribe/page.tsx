import { UnsubscribeForm } from "@waitlist/components/UnsubscribeForm";
import { getTranslations, setRequestLocale } from "next-intl/server";

// S12-09: unsubscribe confirm page (`/waitlist/unsubscribe?token=…`). Not
// behind redirectIfWireframeMode. Unsubscribing needs a button press (a POST),
// so link scanners that GET the URL can't unsubscribe anyone.

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "waitlist.unsubscribe.meta" });
	return {
		title: t("title"),
		robots: { index: false, follow: false },
	};
}

export default async function WaitlistUnsubscribePage(props: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{ token?: string | string[] }>;
}) {
	const { locale } = await props.params;
	setRequestLocale(locale);

	const t = await getTranslations({ locale, namespace: "waitlist.unsubscribe" });
	const { token: rawToken } = await props.searchParams;
	const token = (Array.isArray(rawToken) ? rawToken[0] : rawToken)?.trim();

	return (
		<section className="theme-estate-night min-h-svh bg-background text-foreground">
			<div className="max-w-xl px-6 py-20 md:py-28 mx-auto w-full">
				<p className="text-xs font-mono tracking-[0.22em] text-muted-foreground uppercase">
					{t("eyebrow")}
				</p>
				<h1 className="mt-6 font-medium text-5xl md:text-6xl font-display leading-[1.02] text-primary">
					{t("title")}
				</h1>

				{token ? (
					<>
						<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
							{t("body")}
						</p>
						<div className="mt-10">
							<UnsubscribeForm token={token} />
						</div>
					</>
				) : (
					<p className="mt-6 text-lg leading-relaxed text-muted-foreground">
						{t("missingToken")}
					</p>
				)}
			</div>
		</section>
	);
}
