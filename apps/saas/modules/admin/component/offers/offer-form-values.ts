/** S12-01 Task 7 — pure, framework-free mapping between OfferForm values and the API payload. */
import { z } from "zod";

export const OFFER_CATEGORY_VALUES = [
	"restaurant",
	"hotel",
	"lifestyle",
	"racing",
	"other",
] as const;
export type OfferCategoryValue = (typeof OFFER_CATEGORY_VALUES)[number];

export const offerFormSchema = z.object({
	title: z.string().trim().min(1).max(120),
	partnerName: z.string().trim().min(1).max(120),
	category: z.enum(OFFER_CATEGORY_VALUES),
	description: z.string().trim().min(1).max(2000),
	imageUrl: z.string(),
	discountCode: z.string().max(64),
	redeemUrl: z.string(),
	howToRedeem: z.string().max(500),
	validUntil: z.string(), // "" or yyyy-mm-dd from <input type="date">
	active: z.boolean(),
	sortOrder: z.number().int().min(0),
});
export type OfferFormValues = z.infer<typeof offerFormSchema>;

export const EMPTY_OFFER_FORM: OfferFormValues = {
	title: "",
	partnerName: "",
	category: "other",
	description: "",
	imageUrl: "",
	discountCode: "",
	redeemUrl: "",
	howToRedeem: "",
	validUntil: "",
	active: true,
	sortOrder: 0,
};

export interface OfferPayload {
	title: string;
	partnerName: string;
	category: OfferCategoryValue;
	description: string;
	imageUrl: string | null;
	discountCode: string | null;
	redeemUrl: string | null;
	howToRedeem: string | null;
	validUntil: string | null;
	active: boolean;
	sortOrder: number;
}

interface OfferRowLike {
	title: string;
	partnerName: string;
	category: string;
	description: string;
	imageUrl: string | null;
	discountCode: string | null;
	redeemUrl: string | null;
	howToRedeem: string | null;
	validUntil: Date | string | null;
	active: boolean;
	sortOrder: number;
}

function toCategory(value: string): OfferCategoryValue {
	return (OFFER_CATEGORY_VALUES as readonly string[]).includes(value)
		? (value as OfferCategoryValue)
		: "other";
}

export function toOfferFormValues(offer: OfferRowLike): OfferFormValues {
	return {
		title: offer.title,
		partnerName: offer.partnerName,
		category: toCategory(offer.category),
		description: offer.description,
		imageUrl: offer.imageUrl ?? "",
		discountCode: offer.discountCode ?? "",
		redeemUrl: offer.redeemUrl ?? "",
		howToRedeem: offer.howToRedeem ?? "",
		validUntil: offer.validUntil ? new Date(offer.validUntil).toISOString().slice(0, 10) : "",
		active: offer.active,
		sortOrder: offer.sortOrder,
	};
}

const nullIfBlank = (v: string) => (v.trim() ? v.trim() : null);

export function toOfferPayload(values: OfferFormValues): OfferPayload {
	return {
		title: values.title,
		partnerName: values.partnerName,
		category: values.category,
		description: values.description,
		imageUrl: nullIfBlank(values.imageUrl),
		discountCode: nullIfBlank(values.discountCode),
		redeemUrl: nullIfBlank(values.redeemUrl),
		howToRedeem: nullIfBlank(values.howToRedeem),
		// An offer "valid until 30 Sept" is valid through that day.
		validUntil: values.validUntil ? `${values.validUntil}T23:59:59.999Z` : null,
		active: values.active,
		sortOrder: values.sortOrder,
	};
}
