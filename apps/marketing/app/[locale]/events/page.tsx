import { EventsCalendar } from "@events/components/EventsCalendar";
import { CLUB_TZ, dayKey } from "@events/lib/calendar";
import { pickNextEvent } from "@home/lib/next-event";
import { JoinCtaLink } from "@shared/components/JoinCtaLink";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { Reveal } from "@shared/components/motion/Reveal";
import { SectionLabel } from "@shared/components/motion/SectionLabel";
import { PatternMosaic } from "@shared/components/pattern/PatternMosaic";
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
	const joinLabel = joinCta.labelKey ? tRoot(joinCta.labelKey) : t("joinCta");

	const now = new Date();
	const next = pickNextEvent(items, now);
	const [ny = 0, nm = 1, nd = 1] = (next?.startsAt ? dayKey(next.startsAt) : dayKey(now))
		.split("-")
		.map(Number);
	const nextDate = next?.startsAt ? new Date(next.startsAt) : null;
	const month = nextDate
		? new Intl.DateTimeFormat(activeLocale, { month: "long", timeZone: CLUB_TZ }).format(
				nextDate,
			)
		: "";
	const time = nextDate
		? new Intl.DateTimeFormat(activeLocale, {
				weekday: "long",
				hour: "numeric",
				minute: "2-digit",
				timeZone: CLUB_TZ,
			}).format(nextDate)
		: "";
	// 2024-01-01 is a Monday: Monday-first short weekday labels.
	const weekdays = Array.from({ length: 7 }, (_, i) =>
		new Intl.DateTimeFormat(activeLocale, { weekday: "short", timeZone: "UTC" }).format(
			new Date(Date.UTC(2024, 0, 1 + i)),
		),
	);

	return (
		<div className="bg-page">
			<section
				data-nav-tone="dark"
				className="under-nav grain bg-ink text-white relative isolate overflow-hidden"
			>
				<PatternMosaic
					colourway="navy"
					kind="harlequin"
					columns={4}
					rows={6}
					className="-right-10 top-24 md:grid absolute -z-10 hidden w-[22rem] opacity-60"
				/>
				<div className="gap-6 pb-16 md:pb-24 container flex flex-col">
					<Reveal immediate>
						<SectionLabel index={1} label={t("eyebrow")} className="text-ice" />
					</Reveal>
					<MaskedText
						as="h1"
						immediate
						text={t("title")}
						className="type-display-xl text-balance"
					/>
					<Reveal immediate delayMs={300}>
						<p className="max-w-xl text-lg text-lilac leading-relaxed">
							{t("description")}
						</p>
					</Reveal>
					{next && (
						<Reveal immediate delayMs={500} className="mt-6 gap-6 flex items-end">
							<span className="font-display text-[clamp(6rem,22vw,16rem)] leading-[0.8] tracking-[-0.03em] tabular-nums">
								{nd}
							</span>
							<span className="pb-2 gap-1 flex flex-col">
								<span className="type-label text-ice">
									{month}
									{" · "}
									{time}
								</span>
								<span className="type-display-md max-w-md text-balance">
									{next.name}
								</span>
							</span>
						</Reveal>
					)}
				</div>
			</section>

			<section data-nav-tone="light" className="bg-cream py-14 md:py-20">
				<div className="container">
					<Reveal className="mb-8">
						<SectionLabel index={2} label={t("calendar")} />
					</Reveal>
					{items.length === 0 ? <p className="text-ink-variant">{t("empty")}</p> : null}
					<EventsCalendar
						events={items.map(({ id, name, startsAt, coverImageUrl }) => ({
							id,
							name,
							startsAt: startsAt ? new Date(startsAt).toISOString() : null,
							coverImageUrl,
						}))}
						locale={activeLocale}
						initial={{ year: ny, month: nm - 1 }}
						todayKey={dayKey(now)}
						cta={joinCta}
						labels={{
							prev: t("prevMonth"),
							next: t("nextMonth"),
							close: t("close"),
							membersOnly: t("membersOnly"),
							joinLabel,
							weekdays,
							hasEvents: t("hasEvents"),
						}}
					/>
				</div>
			</section>

			<section
				data-nav-tone="dark"
				className="grain bg-plum py-14 text-white md:py-20 relative isolate overflow-hidden"
			>
				<PatternMosaic
					colourway="lilac"
					kind="ring"
					columns={8}
					rows={2}
					trigger="view"
					className="inset-x-0 top-0 absolute -z-10 opacity-40"
				/>
				<div className="gap-6 pt-10 container flex flex-wrap items-center justify-between">
					<Reveal as="span" className="type-display-lg max-w-xl text-balance">
						{t("rsvpNote")}
					</Reveal>
					<JoinCtaLink cta={joinCta} className={v2Button({ variant: "onDark" })}>
						{joinLabel}
					</JoinCtaLink>
				</div>
			</section>
		</div>
	);
}
