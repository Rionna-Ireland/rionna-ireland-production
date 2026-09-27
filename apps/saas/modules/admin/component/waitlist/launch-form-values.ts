import { z } from "zod";

/**
 * Per-run send limits; mirror DEFAULT_LAUNCH_PER_RUN / MAX_LAUNCH_PER_RUN in
 * packages/api/modules/waitlist/procedures/send-launch.ts (a run must finish
 * inside the 60 s API route).
 */
export const DEFAULT_LAUNCH_PER_RUN = 500;
export const MAX_LAUNCH_PER_RUN = 2000;

/** Typed confirmation gate for the real launch send. */
export const LAUNCH_CONFIRM_WORD = "SEND";

export const launchFormSchema = z.object({
	subject: z.string().trim().min(1).max(200),
	heading: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(10_000),
	ctaUrl: z.union([z.literal(""), z.string().trim().url()]),
	/** Empty = DEFAULT_LAUNCH_PER_RUN. */
	maxToSend: z.union([
		z.literal(""),
		z
			.string()
			.regex(/^[1-9]\d*$/)
			.refine((value) => Number(value) <= MAX_LAUNCH_PER_RUN),
	]),
});

export type LaunchFormValues = z.infer<typeof launchFormSchema>;

export const EMPTY_LAUNCH_FORM: LaunchFormValues = {
	subject: "",
	heading: "",
	body: "",
	ctaUrl: "",
	maxToSend: "",
};

/** Maps form values to the `waitlist.admin.sendLaunch(Test)` content input. */
export function toLaunchContent(values: LaunchFormValues) {
	const ctaUrl = values.ctaUrl.trim();
	return {
		subject: values.subject.trim(),
		heading: values.heading.trim(),
		body: values.body.trim(),
		...(ctaUrl ? { ctaUrl } : {}),
	};
}

/** The per-run cap sent to the server; blank means DEFAULT_LAUNCH_PER_RUN. */
export function toMaxToSend(values: LaunchFormValues): number {
	return values.maxToSend ? Number(values.maxToSend) : DEFAULT_LAUNCH_PER_RUN;
}

/** How many people the real send reaches right now. */
export function recipientsForRun(pending: number, maxToSend: number): number {
	return Math.min(pending, maxToSend);
}
