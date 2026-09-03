export type OfferCategory = "restaurant" | "hotel" | "lifestyle" | "racing" | "other";
export const OFFER_CATEGORIES: OfferCategory[] = ["restaurant", "hotel", "lifestyle", "racing", "other"];

export interface OfferView {
	id: string;
	title: string;
	partnerName: string;
	category: OfferCategory;
	description: string;
	imageUrl: string | null;
	discountCode: string | null;
	redeemUrl: string | null;
	howToRedeem: string | null;
	validUntil: string | null;
}

export interface OfferRecord {
	id: string;
	title: string;
	partnerName: string;
	category: string;
	description: string;
	imageUrl: string | null;
	discountCode: string | null;
	redeemUrl: string | null;
	howToRedeem: string | null;
	validUntil: Date | null;
}

function toCategory(value: string): OfferCategory {
	return (OFFER_CATEGORIES as string[]).includes(value) ? (value as OfferCategory) : "other";
}

export function toOfferView(row: OfferRecord): OfferView {
	return {
		id: row.id,
		title: row.title,
		partnerName: row.partnerName,
		category: toCategory(row.category),
		description: row.description,
		imageUrl: row.imageUrl,
		discountCode: row.discountCode,
		redeemUrl: row.redeemUrl,
		howToRedeem: row.howToRedeem,
		validUntil: row.validUntil ? row.validUntil.toISOString() : null,
	};
}
