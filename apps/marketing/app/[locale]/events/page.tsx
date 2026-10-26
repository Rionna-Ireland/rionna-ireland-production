import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { v2Button } from "@shared/components/ui/v2";
import { getClubEvents } from "@shared/lib/club";
import { getSiteJoinCta } from "@shared/lib/website";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

export const revalidate = 300;

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "events.meta" });
	return {
		title: t("title"),
		description: t("description"),
	};
}

export default async function EventsListPage(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	setRequestLocale(locale);
	redirectIfWireframeMode(locale);

	const t = await getTranslations({ locale, namespace: "events" });
	const activeLocale = await getLocale();
	const { items } = await getClubEvents({ limit: 24 });

	const tRoot = await getTranslations({ locale });
	const joinCta = await getSiteJoinCta();

	return (
		<div className="bg-page">
			<div className="gap-10 py-14 md:py-[56px] container flex flex-col">
				<div className="max-w-3xl gap-3 flex flex-col">
					<span className="type-label text-ink-variant">{t("eyebrow")}</span>
					<h1 className="type-display-xl text-balance">{t("title")}</h1>
					<p className="text-lg text-ink-variant leading-relaxed">{t("description")}</p>
				</div>

				{items.length === 0 ? (
					<p className="text-ink-variant">{t("empty")}</p>
				) : (
					<div className="gap-6 md:grid-cols-2 lg:grid-cols-3 grid">
						{items.map((event) => (
							<div
								key={event.id}
								className="bg-ice-light flex flex-col overflow-hidden rounded-lg"
							>
								<div className="bg-ice relative aspect-[16/10] overflow-hidden">
									{event.coverImageUrl ? (
										// biome-ignore lint/a11y/useAltText: name as alt
										<img
											src={event.coverImageUrl}
											alt={event.name}
											className="inset-0 absolute h-full w-full object-cover"
										/>
									) : (
										<div className="inset-0 text-6xl text-ink/10 absolute flex items-center justify-center font-display">
											R
										</div>
									)}
								</div>
								<div className="p-6 gap-2 flex flex-col">
									<span className="type-label text-ink-variant">
										{event.startsAt
											? new Intl.DateTimeFormat(activeLocale, {
													dateStyle: "full",
													timeStyle: "short",
												}).format(new Date(event.startsAt))
											: ""}
									</span>
									<h2 className="type-display-md">{event.name}</h2>
									<p className="text-sm text-ink-variant">{t("membersOnly")}</p>
								</div>
							</div>
						))}
					</div>
				)}

				<div className="gap-6 p-6 bg-ice-light flex flex-wrap items-center justify-between rounded-lg">
					<span className="type-display-md">{t("rsvpNote")}</span>
					<JoinCtaLink cta={joinCta} className={v2Button({ variant: "primary" })}>
						{joinCta.labelKey ? tRoot(joinCta.labelKey) : t("joinCta")}
					</JoinCtaLink>
				</div>
			</div>
		</div>
	);
}
