import { z } from "zod";

/** Typed confirmation gate for the real launch send. */
export const LAUNCH_CONFIRM_WORD = "SEND";

export const launchFormSchema = z.object({
	subject: z.string().trim().min(1).max(200),
	heading: z.string().trim().min(1).max(200),
	body: z.string().trim().min(1).max(10_000),
	ctaUrl: z.union([z.literal(""), z.string().trim().url()]),
	/** Empty = send to everyone pending. */
	maxToSend: z.union([z.literal(""), z.string().regex(/^[1-9]\d*$/)]),
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

export function toMaxToSend(values: LaunchFormValues): number | undefined {
	return values.maxToSend ? Number(values.maxToSend) : undefined;
}

/** How many people the real send reaches right now. */
export function recipientsForRun(pending: number, maxToSend: number | undefined): number {
	return maxToSend === undefined ? pending : Math.min(pending, maxToSend);
}
