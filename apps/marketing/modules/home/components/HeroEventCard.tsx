import { LocaleLink } from "@i18n/routing";
import type { PublicClubEvent } from "@shared/lib/club";
import { ArrowRightIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import Image from "next/image";

/** Glass card for the next upcoming event. The caller hides it when there is none. */
export async function HeroEventCard({ event }: { event: PublicClubEvent }) {
	const [t, format] = await Promise.all([getTranslations("home.hero"), getFormatter()]);
	const date = event.startsAt
		? format.dateTime(new Date(event.startsAt), {
				weekday: "short",
				day: "numeric",
				month: "long",
				hour: "numeric",
				minute: "2-digit",
			})
		: null;

	return (
		<div className="hero-card inset-x-5 bottom-5 lg:inset-x-8 lg:bottom-8 absolute">
			<LocaleLink
				href="/events"
				aria-label={t("allEvents")}
				className="group card-lift gap-4 border-white/12 bg-white/8 p-3 backdrop-blur-md text-white flex items-center rounded-lg border hover:no-underline"
			>
				{event.coverImageUrl && (
					<div className="photo-zoom size-20 relative shrink-0 rounded-md">
						<Image
							unoptimized
							src={event.coverImageUrl}
							alt=""
							fill
							sizes="80px"
							className="object-cover opacity-80 transition-opacity duration-(--dur-hover) group-hover:opacity-100"
						/>
					</div>
				)}
				<div className="min-w-0 gap-1 flex flex-1 flex-col">
					<span className="type-label text-lilac">{t("nextEvent")}</span>
					<span className="type-display-md line-clamp-2">{event.name}</span>
					{date && <span className="text-sm text-white/70">{date}</span>}
				</div>
				<span className="size-10 bg-white text-ink flex shrink-0 items-center justify-center rounded-full">
					<ArrowRightIcon className="size-4 group-hover:translate-x-1 transition-transform duration-(--dur-hover)" />
				</span>
			</LocaleLink>
		</div>
	);
}
