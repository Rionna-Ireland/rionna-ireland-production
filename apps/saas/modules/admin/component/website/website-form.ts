import type { OrganizationWebsiteMetadata } from "@repo/database/types";

// Caps mirror packages/api/modules/settings/procedures/update-website-content.ts.
export const MAX_FEATURED = 5;
export const MAX_STATS = 4;
export const MAX_INCLUSIONS = 8;
export const MAX_FAQ = 12;
export const MAX_FOUNDERS = 6;

// Text caps mirror website-schema.ts in the api (asserted by WebsiteForm.test).
export const CAP = {
	eyebrow: 60,
	title: 120,
	subtitle: 280,
	statValue: 12,
	statLabel: 40,
	membershipShort: 40,
	inclusion: 120,
	question: 200,
	answer: 1500,
	storyTitle: 120,
	founderName: 80,
	founderRole: 80,
	founderBio: 600,
} as const;

export type WebsiteFormValues = {
	hero: { eyebrow: string; title: string; subtitle: string; imageUrl: string; videoUrl: string };
	featuredHorseIds: string[];
	stats: { value: string; label: string }[];
	membership: {
		price: string;
		interval: string;
		note: string;
		inclusions: string[];
		faq: { question: string; answer: string }[];
	};
	about: {
		storyTitle: string;
		photoUrl: string;
		founders: { name: string; role: string; bio: string; photoUrl: string }[];
	};
	joinMode: "waitlist" | "signup";
};

export const atCap = (list: readonly unknown[], max: number) => list.length >= max;

export function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
	const to = index + dir;
	if (to < 0 || to >= list.length) return list;
	const next = [...list];
	[next[index], next[to]] = [next[to], next[index]];
	return next;
}

const clean = (s: string | undefined) => (s ?? "").trim();

/** Trims, drops blank fields/items and empty sections. */
export function toWebsitePayload(v: WebsiteFormValues): OrganizationWebsiteMetadata {
	const pick = <T extends Record<string, string>>(o: T) =>
		Object.fromEntries(
			Object.entries(o)
				.map(([k, val]) => [k, clean(val)])
				.filter(([, val]) => val),
		) as Partial<T>;
	const nonEmpty = <T extends object>(o: T) => (Object.keys(o).length ? o : undefined);

	const stats = v.stats
		.map((s) => ({ value: clean(s.value), label: clean(s.label) }))
		.filter((s) => s.value && s.label);
	const inclusions = v.membership.inclusions.map(clean).filter(Boolean);
	const faq = v.membership.faq
		.map((f) => ({ question: clean(f.question), answer: clean(f.answer) }))
		.filter((f) => f.question && f.answer);
	const founders = v.about.founders
		.map((f) => ({
			name: clean(f.name),
			role: clean(f.role),
			bio: clean(f.bio),
			...pick({ photoUrl: f.photoUrl }),
		}))
		.filter((f) => f.name);

	const { price, interval, note } = pick({
		price: v.membership.price,
		interval: v.membership.interval,
		note: v.membership.note,
	}) as Record<string, string | undefined>;
	const membership = nonEmpty({
		...(price && { price }),
		...(interval && { interval }),
		...(note && { note }),
		...(inclusions.length && { inclusions }),
		...(faq.length && { faq }),
	});
	const about = nonEmpty({
		...pick({ storyTitle: v.about.storyTitle, photoUrl: v.about.photoUrl }),
		...(founders.length && { founders }),
	});

	return {
		...(nonEmpty(pick(v.hero)) && { hero: pick(v.hero) }),
		...(v.featuredHorseIds.length && { featuredHorseIds: v.featuredHorseIds }),
		...(stats.length && { stats }),
		...(membership && { membership }),
		...(about && { about }),
		joinMode: v.joinMode,
	};
}

export function fromWebsite(w: OrganizationWebsiteMetadata | undefined): WebsiteFormValues {
	return {
		hero: {
			eyebrow: w?.hero?.eyebrow ?? "",
			title: w?.hero?.title ?? "",
			subtitle: w?.hero?.subtitle ?? "",
			imageUrl: w?.hero?.imageUrl ?? "",
			videoUrl: w?.hero?.videoUrl ?? "",
		},
		featuredHorseIds: w?.featuredHorseIds ?? [],
		stats: w?.stats ?? [],
		membership: {
			price: w?.membership?.price ?? "",
			interval: w?.membership?.interval ?? "",
			note: w?.membership?.note ?? "",
			inclusions: w?.membership?.inclusions ?? [],
			faq: w?.membership?.faq ?? [],
		},
		about: {
			storyTitle: w?.about?.storyTitle ?? "",
			photoUrl: w?.about?.photoUrl ?? "",
			founders: (w?.about?.founders ?? []).map((f) => ({ ...f, photoUrl: f.photoUrl ?? "" })),
		},
		joinMode: w?.joinMode ?? "waitlist",
	};
}
