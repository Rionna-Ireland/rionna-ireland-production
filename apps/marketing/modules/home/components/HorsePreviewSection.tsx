import { MediaPlaceholder } from "@shared/components/MediaPlaceholder";
import { getWebsiteContent } from "@shared/lib/website";
import { getTranslations } from "next-intl/server";

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
		<section id="horses" className="scroll-mt-20 gap-5 py-14 container flex flex-col">
			<h2 className="type-display-lg">{t("title")}</h2>
			<div className="gap-4 sm:grid-cols-2 lg:grid-cols-4 grid">
				{horses.map((horse, i) => {
					const photoUrl = firstPhotoUrl(horse.photos);
					return (
						<div
							key={horse.id}
							className="gap-2.5 border-outline bg-white p-3.5 flex flex-col rounded-lg border"
						>
							{photoUrl ? (
								// biome-ignore lint/a11y/useAltText: horse name as alt
								<img
									src={photoUrl}
									alt={horse.name}
									className="h-44 w-full rounded-lg object-cover"
								/>
							) : (
								<MediaPlaceholder tone={TONES[i % TONES.length]} className="h-44" />
							)}
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
			</div>
		</section>
	);
}
