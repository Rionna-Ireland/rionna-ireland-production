import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const charityWriteInput = z.object({
	organizationId: z.string(),
	charityName: z.string().trim().min(1).max(120),
	description: z.string().trim().min(1).max(1000),
	logoUrl: optionalText(2048),
	websiteUrl: z.string().trim().url().max(2048).optional().nullable(),
	percentage: z.number().min(0).max(100).multipleOf(0.01),
	startDate: z.string().datetime(),
	goalCents: z.number().int().min(0).optional().nullable(),
	manualOverrideCents: z.number().int().min(0).optional().nullable(),
	pollId: z.string().optional().nullable(),
});
export type CharityWriteInput = z.infer<typeof charityWriteInput>;

export function toCharityWriteData(input: Omit<CharityWriteInput, "organizationId">) {
	const nullIfEmpty = (v: string | null | undefined) => (v ? v : null);
	return {
		charityName: input.charityName,
		description: input.description,
		logoUrl: nullIfEmpty(input.logoUrl),
		websiteUrl: nullIfEmpty(input.websiteUrl),
		percentage: input.percentage,
		startDate: new Date(input.startDate),
		goalCents: input.goalCents ?? null,
		manualOverrideCents: input.manualOverrideCents ?? null,
		pollId: nullIfEmpty(input.pollId),
	};
}
