import { z } from "zod";

export const pollDraftInput = z.object({
	organizationId: z.string(),
	question: z.string().trim().min(1).max(200),
	scope: z.enum(["club", "space"]),
	circleSpaceId: z.string().optional(),
	closesAt: z.string().datetime().optional(),
	options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
});

export type PollDraftInput = z.infer<typeof pollDraftInput>;

export function resolveDraftFields(input: PollDraftInput) {
	return {
		question: input.question,
		scope: input.scope,
		circleSpaceId: input.scope === "space" ? (input.circleSpaceId ?? null) : null,
		closesAt: input.closesAt ? new Date(input.closesAt) : null,
		options: input.options,
	};
}
