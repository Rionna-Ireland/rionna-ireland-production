import { MediaPlaceholder } from "@shared/components/MediaPlaceholder";
import { MaskedText } from "@shared/components/motion/MaskedText";
import { getWebsiteContent } from "@shared/lib/website";
import { getTranslations } from "next-intl/server";
import type { CSSProperties } from "react";

import { DealRow } from "./DealRow";

type HorsePhoto = { url: string; caption?: string };

function firstPhotoUrl(photos: unknown): string | null {
	if (!Array.isArray(photos) || photos.length === 0) return null;
	const first = photos[0] as HorsePhoto | string | undefined;
	if (!first) return null;
	if (typeof first === "string") return first;
	return first.url ?? null;
}

const STATUS_LABELS: Record<string, string> = {
	PRE_TRAINING: "Pre-training",
	IN_TRAINING: "In training",
	REHAB: "Rehab",
	RETIRED: "Retired",
	SOLD: "Sold",
};

const TONES = ["ice", "sage", "lilac", "cream"] as const;

export async function HorsePreviewSection() {
	const t = await getTranslations("home.horses");
	const { featuredHorses: horses } = await getWebsiteContent();

	if (horses.length === 0) return null;

	return (
		<section id="horses" className="scroll-mt-20 gap-6 py-20 container flex flex-col">
			<span className="type-label text-ink-variant">{t("eyebrow")}</span>
			<MaskedText
				as="h2"
				text={t("title")}
				className="type-display-lg max-w-3xl text-balance"
			/>
			{/* Horizontal film row: drag/trackpad scroll-snap; cards deal in when it enters view. */}
			<DealRow
				ariaLabel={t("title")}
				className="deal-row gap-4 pt-2 pb-4 flex snap-x snap-mandatory overflow-x-auto"
			>
				{horses.map((horse, i) => {
					const photoUrl = firstPhotoUrl(horse.photos);
					return (
						<div
							key={horse.id}
							className="deal-card card-lift gap-2.5 border-outline bg-white p-3.5 flex min-w-[17rem] flex-1 snap-start flex-col rounded-lg border"
							style={{ "--i": i } as CSSProperties}
						>
							<div className="photo-zoom rounded-lg">
								{photoUrl ? (
									// biome-ignore lint/a11y/useAltText: horse name as alt
									<img
										src={photoUrl}
										alt={horse.name}
										className="h-44 w-full object-cover"
									/>
								) : (
									<MediaPlaceholder
										tone={TONES[i % TONES.length]}
										className="h-44"
									/>
								)}
							</div>
							<span className="type-label bg-lilac-light text-plum px-2.5 py-1 self-start rounded-full text-[10px]">
								{STATUS_LABELS[horse.status] ?? horse.status}
							</span>
							<h3 className="font-semibold text-lg text-ink">{horse.name}</h3>
							{horse.trainer?.name && (
								<p className="text-sm text-ink-variant">
									{t("trainerLabel", { name: horse.trainer.name })}
								</p>
							)}
						</div>
					);
				})}
			</DealRow>
		</section>
	);
}
