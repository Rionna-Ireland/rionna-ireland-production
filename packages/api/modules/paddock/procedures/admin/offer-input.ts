import { z } from "zod";

import { OFFER_CATEGORIES } from "../../lib/offer-view";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const offerWriteInput = z.object({
	organizationId: z.string(),
	title: z.string().trim().min(1).max(120),
	partnerName: z.string().trim().min(1).max(120),
	category: z.enum(OFFER_CATEGORIES as [string, ...string[]]),
	description: z.string().trim().min(1).max(2000),
	imageUrl: optionalText(2048),
	discountCode: optionalText(64),
	redeemUrl: z.string().trim().url().max(2048).optional().nullable(),
	howToRedeem: optionalText(500),
	validUntil: z.string().datetime().optional().nullable(),
	active: z.boolean().default(true),
	sortOrder: z.number().int().min(0).default(0),
});
export type OfferWriteInput = z.infer<typeof offerWriteInput>;

/** Normalises the zod input into the DB write shape (empty strings → null). */
export function toOfferWriteData(input: Omit<OfferWriteInput, "organizationId">) {
	const nullIfEmpty = (v: string | null | undefined) => (v ? v : null);
	return {
		title: input.title,
		partnerName: input.partnerName,
		category: input.category,
		description: input.description,
		imageUrl: nullIfEmpty(input.imageUrl),
		discountCode: nullIfEmpty(input.discountCode),
		redeemUrl: nullIfEmpty(input.redeemUrl),
		howToRedeem: nullIfEmpty(input.howToRedeem),
		validUntil: input.validUntil ? new Date(input.validUntil) : null,
		active: input.active,
		sortOrder: input.sortOrder,
	};
}
