/** S12-01 Task 8 — pure, framework-free mapping for the charity admin form. */
import { z } from "zod";

const euroString = z.string().regex(/^(\d+(\.\d{1,2})?)?$/, "Enter an amount like 1200 or 1200.50");

export const charityFormSchema = z.object({
	charityName: z.string().trim().min(1).max(120),
	description: z.string().trim().min(1).max(1000),
	logoUrl: z.string(),
	websiteUrl: z.string(),
	percentage: z.number().min(0).max(100),
	startDate: z.string().min(1), // yyyy-mm-dd
	goalEuro: euroString,
	overrideEuro: euroString,
	pollId: z.string(),
});
export type CharityFormValues = z.infer<typeof charityFormSchema>;

export const EMPTY_CHARITY_FORM: CharityFormValues = {
	charityName: "", description: "", logoUrl: "", websiteUrl: "", percentage: 5,
	startDate: new Date().toISOString().slice(0, 10), goalEuro: "", overrideEuro: "", pollId: "",
};

interface CharityRowLike {
	charityName: string; description: string; logoUrl: string | null; websiteUrl: string | null;
	percentage: number | string | { toNumber(): number }; startDate: Date | string;
	goalCents: number | null; manualOverrideCents: number | null; pollId: string | null;
}

function percentageToNumber(v: CharityRowLike["percentage"]): number {
	if (typeof v === "number") return v;
	if (typeof v === "string") return Number(v);
	return v.toNumber();
}

const centsToEuroString = (cents: number | null) => (cents === null ? "" : (cents / 100).toString());
const euroStringToCents = (v: string): number | null => (v.trim() === "" ? null : Math.round(Number(v) * 100));
const nullIfBlank = (v: string) => (v.trim() ? v.trim() : null);

export function toCharityFormValues(config: CharityRowLike): CharityFormValues {
	return {
		charityName: config.charityName,
		description: config.description,
		logoUrl: config.logoUrl ?? "",
		websiteUrl: config.websiteUrl ?? "",
		percentage: percentageToNumber(config.percentage),
		startDate: new Date(config.startDate).toISOString().slice(0, 10),
		goalEuro: centsToEuroString(config.goalCents),
		overrideEuro: centsToEuroString(config.manualOverrideCents),
		pollId: config.pollId ?? "",
	};
}

export function toCharityPayload(values: CharityFormValues) {
	return {
		charityName: values.charityName,
		description: values.description,
		logoUrl: nullIfBlank(values.logoUrl),
		websiteUrl: nullIfBlank(values.websiteUrl),
		percentage: values.percentage,
		startDate: `${values.startDate}T00:00:00.000Z`,
		goalCents: euroStringToCents(values.goalEuro),
		manualOverrideCents: euroStringToCents(values.overrideEuro),
		pollId: nullIfBlank(values.pollId),
	};
}

export function formatEuro(cents: number): string {
	return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(cents / 100);
}
