import { config } from "@config";
import { Button } from "@repo/ui/components/button";
import { getClubEvents } from "@shared/lib/club";
import { redirectIfWireframeMode } from "@shared/lib/wireframe-mode";
import { ArrowRightIcon } from "lucide-react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";

export const revalidate = 300;

export async function generateMetadata(props: { params: Promise<{ locale: string }> }) {
	const { locale } = await props.params;
	const t = await getTranslations({ locale, namespace: "events" });
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

	const joinUrl = config.saasUrl ? `${String(config.saasUrl).replace(/\/$/, "")}/signup` : "#";

	return (
		<div className="py-16 md:py-24 container">
			<div className="max-w-3xl mb-16">
				<span className="text-xs font-mono tracking-[0.22em] text-foreground/70 uppercase">
					{t("eyebrow")}
				</span>
				<h1 className="mt-4 font-medium text-5xl md:text-6xl lg:text-7xl leading-tight font-display">
					{t("title")}
				</h1>
				<p className="mt-4 text-lg text-foreground/70">{t("description")}</p>
			</div>

			{items.length === 0 ? (
				<p className="text-foreground/60">{t("empty")}</p>
			) : (
				<div className="gap-6 md:grid-cols-2 lg:grid-cols-3 grid">
					{items.map((event) => (
						<div
							key={event.id}
							className="group block overflow-hidden rounded-3xl border bg-card"
						>
							<div className="relative aspect-[16/10] overflow-hidden bg-[#DAEDF3]">
								{event.coverImageUrl ? (
									// biome-ignore lint/a11y/useAltText: name as alt
									<img
										src={event.coverImageUrl}
										alt={event.name}
										className="inset-0 absolute h-full w-full object-cover"
									/>
								) : (
									<div className="inset-0 text-6xl absolute flex items-center justify-center font-display text-foreground/10">
										R
									</div>
								)}
							</div>
							<div className="p-6">
								<span className="font-mono text-[10px] tracking-[0.2em] text-foreground/60 uppercase">
									{event.startsAt
										? new Intl.DateTimeFormat(activeLocale, {
												dateStyle: "full",
												timeStyle: "short",
											}).format(new Date(event.startsAt))
										: ""}
								</span>
								<h2 className="mt-2 font-medium text-2xl leading-tight font-display">
									{event.name}
								</h2>
								<p className="mt-2 text-sm text-foreground/60">
									{t("membersOnly")}
								</p>
							</div>
						</div>
					))}
				</div>
			)}

			<div className="mt-16">
				<Button size="lg" variant="primary" asChild>
					<a href={joinUrl}>
						{t("joinCta")}
						<ArrowRightIcon className="ml-2 size-4" />
					</a>
				</Button>
			</div>
		</div>
	);
}
