export interface CharityStoryTeaser {
	id: string;
	slug: string;
	title: string;
	subtitle: string | null;
	featuredImageUrl: string | null;
	publishedAt: string;
}

export interface CharityView {
	charityName: string;
	description: string;
	logoUrl: string | null;
	websiteUrl: string | null;
	percentage: number;
	totalCents: number;
	goalCents: number | null;
	goalProgress: number | null;
	currency: string;
	stories: CharityStoryTeaser[];
	/** Linked club poll; the app renders it from `/polls/active` so vote patching keeps working. */
	pollId: string | null;
}

/** Prisma returns Decimal for `percentage`; tests and plain objects pass a number. */
type PercentageLike = number | { toNumber(): number };

export interface CharityConfigRecord {
	charityName: string;
	description: string;
	logoUrl: string | null;
	websiteUrl: string | null;
	percentage: PercentageLike;
	goalCents: number | null;
	manualOverrideCents: number | null;
	stripeRevenueCents: number;
	currency: string;
}

export function toPercentageNumber(value: PercentageLike): number {
	return typeof value === "number" ? value : value.toNumber();
}

/**
 * Displayed total. The admin's verified override always wins (even 0); otherwise
 * it's the percentage of gross Stripe-collected subscription revenue since the
 * charity start date (S12-01 decision 2). Never a `count × fee × months` model.
 */
export function computeTotalCents(args: {
	stripeRevenueCents: number;
	percentage: number;
	manualOverrideCents: number | null;
}): number {
	if (args.manualOverrideCents !== null) return args.manualOverrideCents;
	return Math.floor((args.stripeRevenueCents * args.percentage) / 100);
}

export function computeGoalProgress(totalCents: number, goalCents: number | null): number | null {
	if (!goalCents || goalCents <= 0) return null;
	return Math.min(1, totalCents / goalCents);
}

export function toCharityView(args: {
	config: CharityConfigRecord;
	stories: CharityStoryTeaser[];
	pollId: string | null;
}): CharityView {
	const { config } = args;
	const percentage = toPercentageNumber(config.percentage);
	const totalCents = computeTotalCents({
		stripeRevenueCents: config.stripeRevenueCents,
		percentage,
		manualOverrideCents: config.manualOverrideCents,
	});
	return {
		charityName: config.charityName,
		description: config.description,
		logoUrl: config.logoUrl,
		websiteUrl: config.websiteUrl,
		percentage,
		totalCents,
		goalCents: config.goalCents,
		goalProgress: computeGoalProgress(totalCents, config.goalCents),
		currency: config.currency,
		stories: args.stories,
		pollId: args.pollId,
	};
}
