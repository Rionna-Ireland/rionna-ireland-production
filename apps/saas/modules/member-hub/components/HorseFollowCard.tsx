"use client";

import { Switch } from "@repo/ui/components/switch";
import Image from "next/image";
import { useTranslations } from "next-intl";

import {
	firstPhotoUrl,
	formatResultDetail,
	getOrdinal,
	pedigreeLines,
	recentResults,
	type NextRunEntry,
	type RaceResultEntry,
} from "./my-horses-section-logic";

export interface HorseFollowCardHorse {
	id: string;
	name: string;
	isFollowing: boolean;
	photos?: unknown;
	pedigree?: unknown;
	trainer?: { id: string; name: string } | null;
	entries?: RaceResultEntry[];
}

interface HorseFollowCardProps {
	horse: HorseFollowCardHorse;
	nextRun: NextRunEntry | undefined;
	isNextRun: boolean;
	/**
	 * S8-04 §5 org-level kill-switch. When `false`, the follow switch is
	 * hidden entirely — the spec requires the control to be hidden/greyed,
	 * and a disabled org's mutation would otherwise silently no-op.
	 */
	followsEnabled: boolean;
	toggleDisabled: boolean;
	onToggle: (checked: boolean) => void;
}

/**
 * One "My horses" dashboard card (S8-03 §4): photo, trainer/pedigree, the
 * follow toggle, an optional next-run badge, and up to 3 recent results.
 * Modelled on mobile Stables' `horse-card.tsx` + `result-row.tsx`.
 */
export function HorseFollowCard({
	horse,
	nextRun,
	isNextRun,
	followsEnabled,
	toggleDisabled,
	onToggle,
}: HorseFollowCardProps) {
	const t = useTranslations();
	const photoUrl = firstPhotoUrl(horse.photos);
	const pedigree = pedigreeLines(horse.pedigree);
	const results = recentResults(horse.entries, 3);

	return (
		<div className="overflow-hidden rounded-2xl bg-card shadow-sm">
			{photoUrl ? (
				<div className="relative aspect-[3/2] w-full">
					<Image src={photoUrl} alt={horse.name} fill className="object-cover" unoptimized />
				</div>
			) : null}

			<div className="flex flex-col gap-3 p-6">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 className="font-display text-xl text-foreground">{horse.name}</h3>
						{horse.trainer ? (
							<p className="mt-1 text-sm text-muted-foreground">
								{t("app.dashboard.myHorses.trainer", { name: horse.trainer.name })}
							</p>
						) : null}
					</div>
					{followsEnabled ? (
						<Switch
							checked={horse.isFollowing}
							disabled={toggleDisabled}
							aria-label={t("app.dashboard.myHorses.toggleLabel", { name: horse.name })}
							onCheckedChange={onToggle}
						/>
					) : null}
				</div>

				{pedigree.length > 0 ? (
					<p className="text-xs text-muted-foreground">
						{pedigree
							.map((line) => `${t(`app.dashboard.myHorses.pedigree.${line.label}`)}: ${line.name}`)
							.join(" · ")}
					</p>
				) : null}

				{isNextRun && nextRun ? (
					<div className="rounded-lg bg-muted px-3 py-2">
						<p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
							{t("app.dashboard.myHorses.nextRun")}
						</p>
					</div>
				) : null}

				<div>
					<p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
						{t("app.dashboard.myHorses.recentResults")}
					</p>
					{results.length === 0 ? (
						<p className="mt-1 text-sm text-muted-foreground">
							{t("app.dashboard.myHorses.noResults")}
						</p>
					) : (
						<ul className="mt-2 flex flex-col gap-2">
							{results.map((entry, index) => (
								<HorseResultRow key={index} entry={entry} />
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}

function HorseResultRow({ entry }: { entry: RaceResultEntry }) {
	const raceName = entry.race?.name ?? entry.race?.meeting?.course?.name ?? null;
	const detail = formatResultDetail(entry);

	return (
		<li className="text-sm">
			<div className="flex items-baseline justify-between gap-2">
				<span className="font-medium text-foreground">
					{entry.finishingPosition != null ? getOrdinal(entry.finishingPosition) : "—"}
					{raceName ? ` · ${raceName}` : ""}
				</span>
			</div>
			{detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
		</li>
	);
}
